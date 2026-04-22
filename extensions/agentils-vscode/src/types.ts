export type ControlMode = 'normal' | 'alternate' | 'direct'
export type TaskPhase = 'collect' | 'plan' | 'execute' | 'test' | 'summarize'
export type TaskTerminal = 'active' | 'completed' | 'failed' | 'abandoned'
export type LoopDirective =
    | 'noop'
    | 'draft_plan'
    | 'request_clarification'
    | 'execute'
    | 'execution_succeeded'
    | 'execution_failed'
    | 'tests_passed'
    | 'tests_failed'
    | 'finish'

export interface TaskInteractionAction {
    id:
        | 'execute'
        | 'continue_input'
        | 'clarify'
        | 'accept_risk'
        | 'switch_to_direct'
        | 'cancel'
        | 'accept_test'
        | 'replan'
        | 'confirm_finish'
    label: string
}

export interface TaskInteraction {
    interactionKey: string
    requestId: string
    kind: 'plan_confirm' | 'clarification' | 'risk_confirm' | 'test_confirm' | 'finish_confirm'
    title: string
    description: string
    reopenCount: number
    actions: TaskInteractionAction[]
    inputHint?: string
}

export interface TaskState {
    taskId: string
    title: string
    goal: string
    phase: TaskPhase
    controlMode: ControlMode
    terminal: TaskTerminal
}

export interface TimelineEntry {
    id: string
    role: 'system' | 'user' | 'assistant' | 'tool'
    kind: 'text' | 'tool_call' | 'tool_result' | 'interaction_opened' | 'interaction_resolved' | 'status'
    content: unknown
    timestamp: string
}

export interface StateSnapshot {
    session: {
        sessionId: string
        status: 'active' | 'closed'
        activeTaskId: string | null
        taskIds: string[]
        createdAt: string
        updatedAt: string
    }
    task:
        | (TaskState & {
              planSummary?: string | null
              risks?: string[]
              executionResult?: string | null
              testResult?: string | null
              summary?: string | null
          })
        | null
    tasks: TaskState[]
    timeline: TimelineEntry[]
}

export interface TaskInteractionResult {
    interactionKey: string
    actionId?: TaskInteractionAction['id']
    message?: string
    closed?: boolean
}

export interface RunTaskLoopInput {
    sessionId?: string
    taskId?: string
    userIntent?: string
    interactionResult?: TaskInteractionResult
    directive?: LoopDirective
}

export interface RunTaskLoopResult {
    status: 'continue' | 'done' | 'failed' | 'abandoned'
    reason?: string
    task: {
        taskId: string
        phase: TaskPhase
        controlMode: ControlMode
        terminal: TaskTerminal
    }
    interaction: TaskInteraction | null
    output: {
        summary: string
        userVisibleMessage?: string
    }
    next: {
        shouldRecallTool: boolean
        recallMode?: 'immediate'
        canRenderWebview: boolean
    }
    snapshot: StateSnapshot
}
