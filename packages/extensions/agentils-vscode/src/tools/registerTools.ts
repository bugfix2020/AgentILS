import * as vscode from 'vscode'
import type { AgentilsClient } from '@agentils/mcp/client'
import type { ToolName } from '@agentils/mcp/types'
import type { AgentilsWebviewManager } from '../webview/manager.js'

interface ToolInput {
  question?: string
  context?: string
  placeholder?: string
  action?: string
  params?: Record<string, unknown>
}

const TOOL_NAMES: ToolName[] = [
  'request_user_clarification',
  'request_contact_user',
  'request_user_feedback',
  'request_dynamic_action',
]

export function registerTools(
  context: vscode.ExtensionContext,
  client: AgentilsClient,
  webview: AgentilsWebviewManager,
  channel: vscode.OutputChannel,
): void {
  for (const toolName of TOOL_NAMES) {
    const disposable = vscode.lm.registerTool<ToolInput>(toolName, {
      async invoke(options, _token) {
        const input = options.input ?? {}
        const question =
          toolName === 'request_dynamic_action'
            ? (input.params?.question as string | undefined) ?? `dynamic:${input.action}`
            : input.question ?? ''

        if (!question) {
          throw new Error(`${toolName}: missing 'question'`)
        }

        // Open the webview eagerly so the user sees the prompt while we park.
        webview.ensurePanel()

        try {
          const response = await client.park({
            toolName,
            question,
            context: input.context,
            placeholder: input.placeholder,
            action: input.action,
            params: input.params,
          })

          if (response.cancelled) {
            return new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart(
                JSON.stringify({ cancelled: true, message: 'User cancelled the operation' }),
              ),
            ])
          }
          return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(response.text ?? ''),
          ])
        } catch (err) {
          const msg = (err as Error).message
          channel.appendLine(`[AgentILS] ${toolName} failed: ${msg}`)
          if (msg === 'cancelled') {
            return new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart(
                JSON.stringify({ cancelled: true, message: 'User cancelled the operation' }),
              ),
            ])
          }
          throw err
        }
      },
      async prepareInvocation(_options, _token) {
        return {
          confirmationMessages: {
            title: 'AgentILS',
            message: new vscode.MarkdownString(`Allow **${toolName}**?`),
          },
        }
      },
    })
    context.subscriptions.push(disposable)
  }
}
