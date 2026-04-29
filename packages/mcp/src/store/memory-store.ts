import type { InteractionRequest, InteractionResponse, PersistedState } from '../types/index.js'
import { createLogger } from '../util/logger.js'
import { emptyState, type InteractionStore } from './interaction-store.js'

const log = createLogger('memory-store')

export class MemoryStore implements InteractionStore {
    private state: PersistedState = emptyState()

    async load(): Promise<void> {
        this.state = emptyState()
        log.info('memory store initialized', {
            operation: 'state.memory.init',
            requests: 0,
            responses: 0,
        })
    }

    getRequest(id: string): InteractionRequest | undefined {
        return this.state.requests.find((request) => request.id === id)
    }

    listRequests(): InteractionRequest[] {
        return this.state.requests.slice()
    }

    listPending(): InteractionRequest[] {
        return this.state.requests.filter((request) => request.status === 'pending')
    }

    async upsertRequest(req: InteractionRequest): Promise<void> {
        const index = this.state.requests.findIndex((request) => request.id === req.id)
        if (index >= 0) this.state.requests[index] = req
        else this.state.requests.push(req)
    }

    async putResponse(id: string, res: InteractionResponse): Promise<void> {
        this.state.responses[id] = res
        const req = this.getRequest(id)
        if (!req) return
        req.status = res.reason === 'heartbeat-timeout' ? 'expired' : res.cancelled ? 'cancelled' : 'submitted'
        await this.upsertRequest(req)
    }

    getResponse(id: string): InteractionResponse | undefined {
        return this.state.responses[id]
    }

    listResponses(): Record<string, InteractionResponse> {
        return { ...this.state.responses }
    }

    async heartbeat(id: string, now: number): Promise<void> {
        const req = this.getRequest(id)
        if (!req || req.status !== 'pending') return
        req.lastHeartbeatAt = now
        await this.upsertRequest(req)
    }

    async expirePending(now: number, timeoutMs: number): Promise<string[]> {
        const expired: string[] = []
        for (const req of this.state.requests) {
            if (req.status !== 'pending') continue
            if (now - req.lastHeartbeatAt > timeoutMs) {
                req.status = 'expired'
                expired.push(req.id)
            }
        }
        return expired
    }
}
