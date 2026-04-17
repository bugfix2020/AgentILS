import * as vscode from 'vscode'
import type {
  AgentILSApprovalRequestInput,
  AgentILSClarificationRequestInput,
  AgentILSFeedbackRequestInput,
  ContinueTaskInput,
  StartTaskInput,
} from '../model'
import { log } from '../logger'
import type { ConversationSessionManager } from '../session/conversation-session-manager'
import { buildJsonToolResult } from './tool-result-builder'

export const agentilsToolNames = {
  startConversation: 'agentils_start_conversation',
  continueTask: 'agentils_continue_task',
  requestClarification: 'agentils_request_clarification',
  requestFeedback: 'agentils_request_feedback',
  requestApproval: 'agentils_request_approval',
  finishConversation: 'agentils_finish_conversation',
} as const

function summarizeText(value: string | undefined, fallback: string, maxLength = 80) {
  const normalized = value?.trim().replace(/\s+/g, ' ')
  if (!normalized) {
    return fallback
  }
  if (normalized.length <= maxLength) {
    return normalized
  }
  return `${normalized.slice(0, maxLength - 1)}…`
}

export function registerAgentILSLanguageModelTools(
  context: vscode.ExtensionContext,
  sessionManager: ConversationSessionManager,
) {
  context.subscriptions.push(
    vscode.lm.registerTool<StartTaskInput>(agentilsToolNames.startConversation, {
      prepareInvocation(options) {
        const title = summarizeText(options.input.title, 'new task')
        const goal = summarizeText(options.input.goal, 'the requested coding task', 120)
        return {
          invocationMessage: `Starting AgentILS task: ${title}`,
          confirmationMessages: {
            title: 'Start AgentILS task console?',
            message: `Open the AgentILS webview and start tracking this task?\n\n${goal}`,
          },
        }
      },
      async invoke(options) {
        log('lm-tool', '>>> agentils_start_conversation INVOKED', options.input)
        try {
          const snapshot = await sessionManager.startTaskGate(options.input)
          return buildJsonToolResult(snapshot)
        } catch (err) {
          log('lm-tool', 'agentils_start_conversation ERROR', { error: String(err) })
          console.error('[agentils] startConversation error:', err)
          throw err
        }
      },
    }),
    vscode.lm.registerTool<ContinueTaskInput>(agentilsToolNames.continueTask, {
      prepareInvocation(options) {
        const note = summarizeText(options.input?.note, 'the active task')
        return {
          invocationMessage: `Continuing AgentILS task: ${note}`,
        }
      },
      async invoke(options) {
        log('lm-tool', '>>> agentils_continue_task INVOKED', options.input)
        try {
          const snapshot = await sessionManager.continueTask(options.input ?? {})
          return buildJsonToolResult(snapshot)
        } catch (err) {
          log('lm-tool', 'agentils_continue_task ERROR', { error: String(err) })
          console.error('[agentils] continueTask error:', err)
          throw err
        }
      },
    }),
    vscode.lm.registerTool<AgentILSClarificationRequestInput>(agentilsToolNames.requestClarification, {
      prepareInvocation(options) {
        const question = summarizeText(options.input.question, 'missing task detail')
        return {
          invocationMessage: `Opening AgentILS clarification panel: ${question}`,
        }
      },
      async invoke(options) {
        log('lm-tool', '>>> agentils_request_clarification INVOKED', options.input)
        try {
          const result = await sessionManager.requestClarification(options.input)
          return buildJsonToolResult({
            result,
            snapshot: sessionManager.snapshot().snapshot,
          })
        } catch (err) {
          log('lm-tool', 'agentils_request_clarification ERROR', { error: String(err) })
          console.error('[agentils] requestClarification error:', err)
          throw err
        }
      },
    }),
    vscode.lm.registerTool<AgentILSFeedbackRequestInput>(agentilsToolNames.requestFeedback, {
      prepareInvocation(options) {
        const question = summarizeText(options.input.question, 'task feedback')
        return {
          invocationMessage: `Opening AgentILS feedback panel: ${question}`,
        }
      },
      async invoke(options) {
        const result = await sessionManager.requestFeedback(options.input)
        await sessionManager.recordFeedback({
          preferredRunId: options.input.preferredRunId,
          status: result.status,
          message: result.message,
        })
        return buildJsonToolResult({
          result,
          snapshot: sessionManager.snapshot().snapshot,
        })
      },
    }),
    vscode.lm.registerTool<AgentILSApprovalRequestInput>(agentilsToolNames.requestApproval, {
      prepareInvocation(options) {
        const summary = summarizeText(options.input.summary, 'approval request')
        return {
          invocationMessage: `Opening AgentILS approval panel: ${summary}`,
        }
      },
      async invoke(options) {
        await sessionManager.beginApproval(options.input)
        const result = await sessionManager.requestApproval(options.input)
        await sessionManager.recordApproval({
          preferredRunId: options.input.preferredRunId,
          summary: options.input.summary,
          action: result.action,
          status: result.status,
          message: result.message,
        })
        return buildJsonToolResult({
          result,
          snapshot: sessionManager.snapshot().snapshot,
        })
      },
    }),
    vscode.lm.registerTool<{ preferredRunId?: string }>(agentilsToolNames.finishConversation, {
      prepareInvocation() {
        return {
          invocationMessage: 'Finishing the current AgentILS conversation',
        }
      },
      async invoke(options) {
        const result = await sessionManager.finishConversation(options.input.preferredRunId)
        return buildJsonToolResult(result)
      },
    }),
  )
}
