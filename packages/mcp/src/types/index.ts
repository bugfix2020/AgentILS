/**
 * AgentILS core types.
 * Replaces the legacy `human-clarification` request/response shapes.
 */

export type ToolName =
  | 'request_user_clarification'
  | 'request_contact_user'
  | 'request_user_feedback'
  | 'request_dynamic_action'

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
  status: 'pending' | 'submitted' | 'cancelled' | 'expired'
}

export interface InteractionResponse {
  text: string
  images?: Array<{ mimeType: string; data: string /* base64 */ }>
  reportContent?: string
  cancelled?: boolean
  timestamp: number
}

export interface PersistedState {
  version: 1
  requests: InteractionRequest[]
  responses: Record<string, InteractionResponse>
}

export interface ServerOptions {
  /** Override persisted-state file path. Defaults to `~/.agentils/state.json`. */
  statePath?: string
  /** HTTP port for the bridge server. Defaults to 8788. */
  httpPort?: number
  /** Heartbeat timeout in ms. Pending requests expire after this idle window. Default 5 min. */
  heartbeatTimeoutMs?: number
}
