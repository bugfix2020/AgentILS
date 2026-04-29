/**
 * Core orchestration: parked-promise pool for pending interactions.
 * Implements the "single billing, multi-turn" pattern: one tool call blocks
 * here while the webview/UI submits a response via the HTTP bridge.
 */
import { randomUUID } from 'node:crypto'
import type { InteractionStore } from '../store/interaction-store.js'
import type {
    InteractionRequest,
    InteractionResponse,
    StateChangedReason,
    StateSnapshot,
    ToolName,
} from '../types/index.js'
import { cancelledInteractionResponse, timeoutInteractionResponse } from '../interaction/response.js'
import { createLogger } from '../util/logger.js'

const log = createLogger('orchestrator')

interface ParkedCall {
    resolve: (res: InteractionResponse) => void
    reject: (err: Error) => void
}

export class Orchestrator {
    private readonly parked = new Map<string, ParkedCall>()
    private readonly subscribers = new Set<(evt: SseEvent) => void>()
    private version = 0
    private readonly errors: StateSnapshot['errors'] = []

    constructor(
        private readonly store: InteractionStore,
        private readonly heartbeatTimeoutMs: number,
    ) {
        const pending = store.listPending()
        log.info('orchestrator constructed', {
            operation: 'orchestrator.start',
            heartbeatTimeoutMs,
            pendingReplayCount: pending.length,
            pendingRequestIds: pending.map((req) => req.id),
        })
    }

    /** Returns the live pending requests (used by webview boot to recover state). */
    pending(): InteractionRequest[] {
        return this.store.listPending()
    }

    /** Returns the canonical MCP state read model for host adapters. */
    snapshot(): StateSnapshot {
        const requests = this.store.listRequests()
        return {
            version: this.version,
            generatedAt: Date.now(),
            heartbeatTimeoutMs: this.heartbeatTimeoutMs,
            interactions: {
                pending: requests.filter((request) => request.status === 'pending'),
                submitted: requests.filter((request) => request.status === 'submitted'),
                cancelled: requests.filter((request) => request.status === 'cancelled'),
                expired: requests.filter((request) => request.status === 'expired'),
                responses: this.store.listResponses(),
            },
            errors: this.errors.slice(-20),
        }
    }

    /** Subscribe to SSE-style events (used by HTTP bridge). */
    subscribe(fn: (evt: SseEvent) => void): () => void {
        this.subscribers.add(fn)
        return () => this.subscribers.delete(fn)
    }

    /**
     * Park a new interaction. The returned promise resolves once the user
     * submits via the HTTP bridge or rejects on cancel/expire.
     */
    async park(input: {
        toolName: ToolName
        question: string
        context?: string
        placeholder?: string
        action?: string
        params?: Record<string, unknown>
    }): Promise<InteractionResponse> {
        const id = randomUUID()
        const now = Date.now()
        const traceId = `agentils-${input.toolName}-${now}-${id.slice(0, 8)}`
        const req: InteractionRequest = {
            id,
            toolName: input.toolName,
            question: input.question,
            context: input.context,
            placeholder: input.placeholder,
            action: input.action,
            params: input.params,
            createdAt: now,
            lastHeartbeatAt: now,
            traceId,
            status: 'pending',
        }
        await this.store.upsertRequest(req)
        this.broadcast({ type: 'request.created', request: req })
        this.broadcastStateChanged('request.created', id)
        log.info('parked interaction', {
            operation: 'request.park',
            requestId: id,
            traceId,
            toolName: input.toolName,
            status: req.status,
            qLen: input.question.length,
        })

        return new Promise<InteractionResponse>((resolve, reject) => {
            this.parked.set(id, { resolve, reject })
        })
    }

    /** Called by the HTTP bridge when the webview submits. */
    async submit(id: string, res: InteractionResponse): Promise<void> {
        await this.store.putResponse(id, res)
        const req = this.store.getRequest(id)
        const parked = this.parked.get(id)
        if (parked) {
            this.parked.delete(id)
            parked.resolve(res)
            log.info('resolved parked', {
                operation: 'request.submit',
                requestId: id,
                traceId: req?.traceId,
                toolName: req?.toolName,
                status: req?.status,
                textLen: (res.text ?? '').length,
                imageCount: res.images?.length ?? 0,
            })
        } else {
            log.warn('submit for unknown/already-resolved id', {
                operation: 'request.submit',
                requestId: id,
                traceId: req?.traceId,
                toolName: req?.toolName,
                status: req?.status,
            })
        }
        this.broadcast({ type: 'request.submitted', id, response: res })
        this.broadcastStateChanged('interaction.submitted', id)
    }

    async cancel(id: string): Promise<void> {
        const res = cancelledInteractionResponse()
        await this.store.putResponse(id, res)
        const req = this.store.getRequest(id)
        const parked = this.parked.get(id)
        if (parked) {
            this.parked.delete(id)
            parked.reject(new Error('cancelled'))
            log.info('cancelled parked', {
                operation: 'request.cancel',
                requestId: id,
                traceId: req?.traceId,
                toolName: req?.toolName,
                status: req?.status,
            })
        } else {
            log.warn('cancel for unknown id', {
                operation: 'request.cancel',
                requestId: id,
                traceId: req?.traceId,
                toolName: req?.toolName,
                status: req?.status,
            })
        }
        this.broadcast({ type: 'request.cancelled', id })
        this.broadcastStateChanged('interaction.cancelled', id)
    }

    async heartbeat(id: string): Promise<void> {
        await this.store.heartbeat(id, Date.now())
        const req = this.store.getRequest(id)
        log.info('heartbeat', {
            operation: 'request.heartbeat',
            requestId: id,
            traceId: req?.traceId,
            toolName: req?.toolName,
            status: req?.status,
        })
        if (req?.status === 'pending') this.broadcastStateChanged('interaction.heartbeat', id)
    }

    /** Periodic sweep — invoked by a timer in the HTTP server. */
    async sweepExpired(): Promise<void> {
        const expired = await this.store.expirePending(Date.now(), this.heartbeatTimeoutMs)
        for (const id of expired) {
            const req = this.store.getRequest(id)
            await this.store.putResponse(id, timeoutInteractionResponse())
            const parked = this.parked.get(id)
            if (parked) {
                this.parked.delete(id)
                parked.reject(new Error('heartbeat-timeout'))
            }
            this.broadcast({ type: 'request.expired', id })
            this.broadcastStateChanged('interaction.expired', id)
            log.warn('expired parked (heartbeat timeout)', {
                operation: 'request.expire',
                requestId: id,
                traceId: req?.traceId,
                toolName: req?.toolName,
                status: req?.status,
            })
        }
    }

    private broadcast(evt: SseEvent): void {
        let count = 0
        for (const fn of this.subscribers) {
            try {
                fn(evt)
                count++
            } catch (err) {
                log.warn('subscriber threw', { error: (err as Error).message })
            }
        }
        log.info('broadcast', {
            operation: 'sse.broadcast',
            type: evt.type,
            subscribers: count,
        })
    }

    private broadcastStateChanged(reason: StateChangedReason, requestId?: string): void {
        this.version += 1
        this.broadcast({
            type: 'state.changed',
            reason,
            requestId,
            version: this.version,
            snapshot: this.snapshot(),
        })
    }
}

export type SseEvent =
    | { type: 'request.created'; request: InteractionRequest }
    | { type: 'request.submitted'; id: string; response: InteractionResponse }
    | { type: 'request.cancelled'; id: string }
    | { type: 'request.expired'; id: string }
    | { type: 'heartbeat'; now: number }
    | {
          type: 'state.changed'
          reason: StateChangedReason
          requestId?: string
          version: number
          snapshot: StateSnapshot
      }
