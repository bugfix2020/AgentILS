export type ControlMode = 'normal' | 'alternate' | 'direct'
export type TaskPhase = 'collect' | 'plan' | 'execute' | 'test' | 'summarize' | 'idle'
export type TaskTerminal = 'active' | 'completed' | 'failed' | 'abandoned'
export type InteractionKind = 'plan_confirm' | 'clarification' | 'risk_confirm' | 'test_confirm' | 'finish_confirm'
export type TimelineRole = 'system' | 'user' | 'assistant' | 'tool'
export type TimelineKind = 'text' | 'tool_call' | 'tool_result' | 'interaction_opened' | 'interaction_resolved' | 'status'
export type InteractionActionId =
  | 'execute'
  | 'continue_input'
  | 'clarify'
  | 'accept_risk'
  | 'switch_to_direct'
  | 'cancel'
  | 'accept_test'
  | 'replan'
  | 'confirm_finish'

export interface InteractionAction {
  id: InteractionActionId
  label: string
}

export interface WebviewViewModel {
  task: {
    taskId: string | null
    title: string
    phase: TaskPhase
    controlMode: ControlMode
    terminal: TaskTerminal | 'active'
  }
  tasks: Array<{
    taskId: string
    title: string
    phase: TaskPhase
    controlMode: ControlMode
    terminal: TaskTerminal
    archived: boolean
  }>
  content: {
    summary: string
    userVisibleMessage?: string | null
    planSummary?: string | null
    risks?: string[]
    executionResult?: string | null
    testResult?: string | null
    finalSummary?: string | null
  }
  interaction: {
    exists: boolean
    kind?: InteractionKind
    interactionKey?: string
    requestId?: string
    reopenCount?: number
    title?: string
    description?: string
    actions: InteractionAction[]
    inputHint?: string
  }
  session: {
    sessionId: string
    status: 'active' | 'closed'
  }
  timeline: Array<{
    id: string
    role: TimelineRole
    kind: TimelineKind
    content: string
    timestamp: string
  }>
  composer: {
    placeholder: string
    suggestedCommands: string[]
  }
}

export type HostToWebviewMessage =
  | {
      type: 'render'
      payload: WebviewViewModel
    }
  | {
      type: 'set_busy'
      payload: { busy: boolean }
    }
  | {
      type: 'show_error'
      payload: { message: string }
    }

export type WebviewToHostMessage =
  | {
      type: 'submit_user_message'
      payload: {
        message: string
      }
    }
  | {
      type: 'submit_interaction_result'
      payload: {
        interactionKey: string
        actionId?: InteractionActionId
        message?: string
      }
    }
  | {
      type: 'ui_closed'
      payload: {
        interactionKey?: string
      }
    }
  | {
      type: 'ready'
    }
  | {
      type: 'rendered'
    }
  | {
      type: 'client_error'
      payload: {
        message: string
        detail?: string
      }
    }

declare global {
  interface Window {
    __AGENTILS_BOOTSTRAP__?: HostToWebviewMessage
    acquireVsCodeApi?: () => { postMessage: (message: WebviewToHostMessage) => void }
  }
}
