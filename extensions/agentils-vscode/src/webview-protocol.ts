import type { ControlMode, TaskInteraction, TaskInteractionAction, TaskPhase, TaskTerminal } from './types'

export interface WebviewViewModel {
    task: {
        taskId: string | null
        title: string
        phase: TaskPhase | 'idle'
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
        kind?: TaskInteraction['kind']
        interactionKey?: string
        requestId?: string
        reopenCount?: number
        title?: string
        description?: string
        actions: TaskInteractionAction[]
        inputHint?: string
    }
    session: {
        sessionId: string
        status: 'active' | 'closed'
    }
    timeline: Array<{
        id: string
        role: 'system' | 'user' | 'assistant' | 'tool'
        kind: 'text' | 'tool_call' | 'tool_result' | 'interaction_opened' | 'interaction_resolved' | 'status'
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
              actionId?: TaskInteractionAction['id']
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

export function isWebviewToHostMessage(value: unknown): value is WebviewToHostMessage {
    if (!value || typeof value !== 'object') {
        return false
    }

    const candidate = value as { type?: unknown }
    return typeof candidate.type === 'string'
}
