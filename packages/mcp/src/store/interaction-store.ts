import type { InteractionRequest, InteractionResponse, PersistedState } from '../types/index.js'

export interface InteractionStore {
    getRequest(id: string): InteractionRequest | undefined
    listRequests(): InteractionRequest[]
    listPending(): InteractionRequest[]
    upsertRequest(req: InteractionRequest): Promise<void>
    putResponse(id: string, res: InteractionResponse): Promise<void>
    getResponse(id: string): InteractionResponse | undefined
    listResponses(): Record<string, InteractionResponse>
    heartbeat(id: string, now: number): Promise<void>
    expirePending(now: number, timeoutMs: number): Promise<string[]>
}

export function emptyState(): PersistedState {
    return {
        version: 1,
        requests: [],
        responses: {},
    }
}
