/**
 * Core orchestration: parked-promise pool for pending interactions.
 * Implements the "single billing, multi-turn" pattern: one tool call blocks
 * here while the webview/UI submits a response via the HTTP bridge.
 */
import { randomUUID } from 'node:crypto'
import type { JsonStore } from '../store/json-store.js'
import type {
  InteractionRequest,
  InteractionResponse,
  ToolName,
} from '../types/index.js'

interface ParkedCall {
  resolve: (res: InteractionResponse) => void
  reject: (err: Error) => void
}

export class Orchestrator {
  private readonly parked = new Map<string, ParkedCall>()
  private readonly subscribers = new Set<(evt: SseEvent) => void>()

  constructor(
    private readonly store: JsonStore,
    private readonly heartbeatTimeoutMs: number,
  ) {}

  /** Returns the live pending requests (used by webview boot to recover state). */
  pending(): InteractionRequest[] {
    return this.store.listPending()
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
      status: 'pending',
    }
    await this.store.upsertRequest(req)
    this.broadcast({ type: 'request.created', request: req })

    return new Promise<InteractionResponse>((resolve, reject) => {
      this.parked.set(id, { resolve, reject })
    })
  }

  /** Called by the HTTP bridge when the webview submits. */
  async submit(id: string, res: InteractionResponse): Promise<void> {
    await this.store.putResponse(id, res)
    const parked = this.parked.get(id)
    if (parked) {
      this.parked.delete(id)
      parked.resolve(res)
    }
    this.broadcast({ type: 'request.submitted', id, response: res })
  }

  async cancel(id: string): Promise<void> {
    const res: InteractionResponse = {
      text: '',
      cancelled: true,
      timestamp: Date.now(),
    }
    await this.store.putResponse(id, res)
    const parked = this.parked.get(id)
    if (parked) {
      this.parked.delete(id)
      parked.reject(new Error('cancelled'))
    }
    this.broadcast({ type: 'request.cancelled', id })
  }

  async heartbeat(id: string): Promise<void> {
    await this.store.heartbeat(id, Date.now())
  }

  /** Periodic sweep — invoked by a timer in the HTTP server. */
  async sweepExpired(): Promise<void> {
    const expired = await this.store.expirePending(Date.now(), this.heartbeatTimeoutMs)
    for (const id of expired) {
      const parked = this.parked.get(id)
      if (parked) {
        this.parked.delete(id)
        parked.reject(new Error('heartbeat-timeout'))
      }
      this.broadcast({ type: 'request.expired', id })
    }
  }

  private broadcast(evt: SseEvent): void {
    for (const fn of this.subscribers) {
      try {
        fn(evt)
      } catch {
        // ignore subscriber errors
      }
    }
  }
}

export type SseEvent =
  | { type: 'request.created'; request: InteractionRequest }
  | { type: 'request.submitted'; id: string; response: InteractionResponse }
  | { type: 'request.cancelled'; id: string }
  | { type: 'request.expired'; id: string }
  | { type: 'heartbeat'; now: number }
