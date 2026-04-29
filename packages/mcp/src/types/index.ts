/**
 * AgentILS core types.
 * Replaces the legacy `human-clarification` request/response shapes.
 */

export type ToolName =
    | 'request_user_clarification'
    | 'request_contact_user'
    | 'request_user_feedback'
    | 'request_dynamic_action'

export type InteractionStatus = 'pending' | 'submitted' | 'cancelled' | 'expired'

export interface InteractionImage {
    /** Original filename when supplied by the UI. */
    filename?: string
    /** MIME type when known. Data URLs may also carry it inline. */
    mimeType?: string
    /** Base64 content or a `data:<mime>;base64,...` URL. */
    data: string
}

export interface InteractionRequest {
    id: string
    toolName: ToolName
    question: string
    context?: string
    placeholder?: string
    /** Free-form payload for `request_dynamic_action`. */
    action?: string
    params?: Record<string, unknown>
    createdAt: number
    /** Last heartbeat timestamp (epoch ms). Updated by client polling/SSE. */
    lastHeartbeatAt: number
    /** Correlates MCP, Extension, CLI, and logger records for one lifecycle. */
    traceId: string
    status: InteractionStatus
}

export interface InteractionResponse {
    text: string
    images?: InteractionImage[]
    reportContent?: string | null
    cancelled?: boolean
    timestamp: number
    reason?: 'cancelled' | 'heartbeat-timeout' | string
}

export interface PersistedState {
    version: 1
    requests: InteractionRequest[]
    responses: Record<string, InteractionResponse>
}

export interface StateSnapshot {
    version: number
    generatedAt: number
    heartbeatTimeoutMs: number
    interactions: {
        pending: InteractionRequest[]
        submitted: InteractionRequest[]
        cancelled: InteractionRequest[]
        expired: InteractionRequest[]
        responses: Record<string, InteractionResponse>
    }
    errors: Array<{ message: string; detail?: string; timestamp: number }>
}

export type StateChangedReason =
    | 'state.replayed'
    | 'request.created'
    | 'interaction.submitted'
    | 'interaction.cancelled'
    | 'interaction.heartbeat'
    | 'interaction.expired'

export interface ServerOptions {
    /** Override persisted-state file path. Defaults to `~/.agentils/state.json`. */
    statePath?: string
    /** HTTP port for the bridge server. Defaults to 8788. */
    httpPort?: number
    /** Enable the shared JSONL HTTP logger. Defaults to true. */
    logServer?: boolean
    /** HTTP port for the shared JSONL logger. Defaults to 12138. */
    logPort?: number
    /** Override log directory. Defaults to `<cwd>/.hc/logs`. */
    logDir?: string
    /** Heartbeat timeout in ms. Pending requests expire after this idle window. Default 5 min. */
    heartbeatTimeoutMs?: number
}
