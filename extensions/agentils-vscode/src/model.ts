export type AgentILSControlMode = 'normal' | 'alternate' | 'direct'

export type AgentILSConversationState = 'active_task' | 'await_next_task' | 'conversation_blocked' | 'conversation_done'

export type AgentILSTaskPhase =
  | 'collect'
  | 'confirm_elements'
  | 'plan'
  | 'approval'
  | 'execute'
  | 'handoff_prepare'
  | 'verify'
  | 'done'
  | 'blocked'
  | 'cancelled'
  | 'failed'

export type AgentILSTaskStatus =
  | 'active'
  | 'awaiting_user'
  | 'awaiting_approval'
  | 'budget_exceeded'
  | 'completed'
  | 'cancelled'
  | 'failed'

export interface AgentILSOverrideState {
  confirmed: boolean
  acknowledgedAt: string | null
  note: string | null
}

export interface AgentILSTaskSummaryDocument {
  taskId: string
  title: string
  filePath: string
  markdown: string
  generatedAt: string
  updatedAt: string
  userEdited: boolean
}

export interface AgentILSTaskSnapshot {
  taskId: string
  runId: string
  title: string
  goal: string
  controlMode: AgentILSControlMode
  phase: AgentILSTaskPhase
  status: AgentILSTaskStatus
  scope: string[]
  constraints: string[]
  risks: string[]
  openQuestions: string[]
  assumptions: string[]
  decisionNeededFromUser: string[]
  notes: string[]
  overrideState: AgentILSOverrideState
  summaryDocument: AgentILSTaskSummaryDocument | null
  createdAt: string
  updatedAt: string
}

export interface AgentILSConversationSnapshot {
  conversationId: string
  state: AgentILSConversationState
  taskIds: string[]
  activeTaskId: string | null
  lastSummaryTaskId: string | null
  createdAt: string
  updatedAt: string
}

export interface AgentILSRuntimeSnapshot {
  conversation: AgentILSConversationSnapshot
  activeTask: AgentILSTaskSnapshot | null
  taskHistory: AgentILSTaskSnapshot[]
  latestSummary: AgentILSTaskSummaryDocument | null
  session: AgentILSSessionState | null
}

export type AgentILSInteractionKind = 'clarification' | 'feedback' | 'approval' | 'startTask'

export type AgentILSFeedbackStatus = 'continue' | 'done' | 'revise'

export type AgentILSApprovalAction = 'accept' | 'decline' | 'cancel'

export type AgentILSRiskLevel = 'low' | 'medium' | 'high'

export interface AgentILSToolRequestOptions {
  preferredRunId?: string
}

export interface AgentILSMcpElicitationParams {
  mode?: string
  message?: string
  summary?: string
  riskLevel?: AgentILSRiskLevel
  targets?: string[]
  runId?: string
  title?: string
  goal?: string
  controlMode?: AgentILSControlMode
  requestedSchema?: Record<string, unknown>
  _meta?: {
    agentilsInteractionKind?: AgentILSInteractionKind
    agentilsSessionId?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface AgentILSMcpElicitationResult {
  action: string
  content?: Record<string, unknown> | null
}

export type AgentILSElicitationHandler = (
  params: AgentILSMcpElicitationParams,
) => Promise<AgentILSMcpElicitationResult>

export interface StartTaskInput {
  title: string
  goal: string
  scope?: string[]
  constraints?: string[]
  risks?: string[]
  openQuestions?: string[]
  assumptions?: string[]
  decisionNeededFromUser?: string[]
  controlMode?: AgentILSControlMode
}

export interface ContinueTaskInput extends AgentILSToolRequestOptions {
  note?: string
}

export interface MarkTaskDoneInput extends AgentILSToolRequestOptions {
  summary?: string
}

export interface AcceptOverrideInput extends AgentILSToolRequestOptions {
  acknowledgement: string
  level?: 'soft' | 'hard'
}

export interface AgentILSPendingInteractionOption {
  label: string
  value: string
  description?: string
}

export interface AgentILSPendingInteraction {
  requestId: string
  kind: AgentILSInteractionKind
  runId: string | null
  title: string
  description: string
  placeholder?: string
  required: boolean
  options?: AgentILSPendingInteractionOption[]
  summary?: string
  riskLevel?: AgentILSRiskLevel
  targets?: string[]
  risks?: string[]
  controlMode?: AgentILSControlMode
  draftTitle?: string
  draftGoal?: string
  draftControlMode?: AgentILSControlMode
}

export interface AgentILSPanelState {
  snapshot: AgentILSRuntimeSnapshot
  pendingInteraction: AgentILSPendingInteraction | null
  /** Derived from the active task's controlMode for convenient access by the panel renderer. */
  controlMode?: AgentILSControlMode
  /** Derived from the active task's overrideState.confirmed for convenient access by the panel renderer. */
  overrideActive?: boolean
}

export type AgentILSSessionStatus = 'active' | 'finished'
export type AgentILSSessionMessageRole = 'system' | 'user' | 'assistant' | 'tool'
export type AgentILSSessionMessageKind =
  | 'text'
  | 'tool_call'
  | 'tool_result'
  | 'interaction_opened'
  | 'interaction_resolved'
  | 'status'
export type AgentILSSessionMessageState = 'pending' | 'streaming' | 'final'

export interface AgentILSSessionPendingInteraction {
  requestId: string
  kind: AgentILSInteractionKind
  title: string
  description: string
  required: boolean
  runId: string | null
  controlMode?: AgentILSControlMode
  options: AgentILSPendingInteractionOption[]
  targets: string[]
  risks: string[]
  placeholder?: string
  summary?: string
  riskLevel?: AgentILSRiskLevel
  draftTitle?: string
  draftGoal?: string
  draftControlMode?: AgentILSControlMode
  createdAt: string
}

export interface AgentILSSessionMessage {
  id: string
  role: AgentILSSessionMessageRole
  kind: AgentILSSessionMessageKind
  content: string
  timestamp: string
  state: AgentILSSessionMessageState
}

export interface AgentILSSessionState {
  sessionId: string
  status: AgentILSSessionStatus
  conversationId: string
  runId: string | null
  messages: AgentILSSessionMessage[]
  queuedUserMessageIds: string[]
  pendingInteraction: AgentILSSessionPendingInteraction | null
  createdAt: string
  updatedAt: string
}

export interface AgentILSSessionToolRequestOptions extends AgentILSToolRequestOptions {
  preferredSessionId?: string
}

export interface AgentILSSessionMessageInput extends AgentILSSessionToolRequestOptions {
  role: AgentILSSessionMessageRole
  kind: AgentILSSessionMessageKind
  content: string
  state?: AgentILSSessionMessageState
}

export interface AgentILSSessionUserMessageInput extends AgentILSSessionToolRequestOptions {
  content: string
}

export interface AgentILSSessionAssistantMessageInput extends AgentILSSessionToolRequestOptions {
  messageId?: string
  content: string
  state?: AgentILSSessionMessageState
}

export interface AgentILSSessionToolEventInput extends AgentILSSessionToolRequestOptions {
  kind: 'tool_call' | 'tool_result' | 'status'
  content: string
  state?: AgentILSSessionMessageState
}

export interface AgentILSSessionConsumeUserMessageInput extends AgentILSSessionToolRequestOptions {
  messageId: string
}

export interface AgentILSSessionFinishInput extends AgentILSSessionToolRequestOptions {}

export interface AgentILSClarificationRequestInput extends AgentILSToolRequestOptions {
  question: string
  context?: string
  placeholder?: string
  required?: boolean
}

export interface AgentILSStartTaskGateInput {
  title?: string
  goal?: string
  controlMode?: AgentILSControlMode
}

export interface AgentILSStartTaskGateResult {
  action: 'accept' | 'cancel'
  content?: {
    title: string
    goal: string
    controlMode?: AgentILSControlMode
  } | null
  requestId: string
  traceId: string
  recordedAt: string
}

export interface AgentILSClarificationResult {
  status: 'submitted' | 'cancelled'
  content: string
  requestId: string
  traceId: string
  recordedAt: string
}

export interface AgentILSFeedbackRequestInput extends AgentILSToolRequestOptions {
  question: string
  summary: string
  allowedActions?: AgentILSFeedbackStatus[]
}

export interface AgentILSFeedbackResult {
  status: AgentILSFeedbackStatus | 'cancel'
  message: string
  requestId: string
  traceId: string
  recordedAt: string
}

export interface AgentILSRecordFeedbackInput extends AgentILSToolRequestOptions {
  status: AgentILSFeedbackStatus | 'cancel'
  message: string
}

export interface AgentILSApprovalRequestInput extends AgentILSToolRequestOptions {
  summary: string
  riskLevel: AgentILSRiskLevel
  targets?: string[]
}

export interface AgentILSApprovalResult {
  action: AgentILSApprovalAction
  status: AgentILSFeedbackStatus | 'cancel'
  message: string
  requestId: string
  traceId: string
  recordedAt: string
}

export interface AgentILSRecordApprovalInput extends AgentILSToolRequestOptions {
  summary: string
  action: AgentILSApprovalAction
  status: AgentILSFeedbackStatus | 'cancel'
  message: string
}

export interface AgentILSFinishConversationResult {
  conversationState: AgentILSConversationState
  allowedToFinish: boolean
  reason: string | null
  snapshot: AgentILSRuntimeSnapshot
}
