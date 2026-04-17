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
}

export type AgentILSInteractionKind = 'clarification' | 'feedback' | 'approval'

export type AgentILSFeedbackStatus = 'continue' | 'done' | 'revise'

export type AgentILSApprovalAction = 'accept' | 'decline' | 'cancel'

export type AgentILSRiskLevel = 'low' | 'medium' | 'high'

export interface AgentILSToolRequestOptions {
  preferredRunId?: string
}

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
}

export interface AgentILSPanelState {
  snapshot: AgentILSRuntimeSnapshot
  pendingInteraction: AgentILSPendingInteraction | null
  /** Derived from the active task's controlMode for convenient access by the panel renderer. */
  controlMode?: AgentILSControlMode
  /** Derived from the active task's overrideState.confirmed for convenient access by the panel renderer. */
  overrideActive?: boolean
}

export interface AgentILSClarificationRequestInput extends AgentILSToolRequestOptions {
  question: string
  context?: string
  placeholder?: string
  required?: boolean
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
