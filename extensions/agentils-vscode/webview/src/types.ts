export type TaskConsoleComposerMode = 'newTask' | 'continueTask' | 'markTaskDone' | 'acceptOverride'

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
export type AgentILSInteractionKind = 'clarification' | 'feedback' | 'approval' | 'startTask'
export type AgentILSFeedbackStatus = 'continue' | 'done' | 'revise'
export type AgentILSApprovalAction = 'accept' | 'decline' | 'cancel'
export type AgentILSRiskLevel = 'low' | 'medium' | 'high'

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
  controlMode?: AgentILSControlMode
  overrideActive?: boolean
}

export type TaskConsoleMessage =
  | { action?: 'newTask' | 'continueTask' | 'markTaskDone' | 'acceptOverride' | 'openSummary' }
  | { action: 'submitNewTask'; title?: string; goal?: string }
  | { action: 'submitContinueTask'; note?: string }
  | { action: 'submitMarkTaskDone'; summary?: string }
  | { action: 'submitAcceptOverride'; acknowledgement?: string }
  | { action: 'submitSessionMessage'; content?: string }
  | { action: 'finishSession' }
  | {
      action: 'submitPendingInteraction'
      requestId: string
      content?: string
      status?: string
      responseAction?: string
      message?: string
      title?: string
      goal?: string
      controlMode?: string
    }
  | { action: 'cancelPendingInteraction'; requestId: string }
  | { action: 'submitApprovalConfirm'; requestId: string }
  | { action: 'submitApprovalDecline'; requestId: string; reason?: string }

export interface WebviewBootstrapPayload {
  type: 'bootstrap'
  payload: AgentILSPanelState
  composerMode: TaskConsoleComposerMode
}

export interface WebviewStateUpdatePayload {
  type: 'stateUpdate'
  payload: AgentILSPanelState
  composerMode: TaskConsoleComposerMode
}

export interface WebviewSessionUpdatePayload {
  type: 'sessionUpdate'
  payload: AgentILSPanelState
  composerMode: TaskConsoleComposerMode
}

export type WebviewIncomingMessage =
  | WebviewBootstrapPayload
  | WebviewStateUpdatePayload
  | WebviewSessionUpdatePayload
