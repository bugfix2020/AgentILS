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

export type AgentILSTaskStatus = 'active' | 'blocked' | 'done'

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

export interface ContinueTaskInput {
  note?: string
}

export interface MarkTaskDoneInput {
  summary?: string
}

export interface AcceptOverrideInput {
  acknowledgement: string
}
