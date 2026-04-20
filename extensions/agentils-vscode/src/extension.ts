import { existsSync } from 'node:fs'
import { join } from 'node:path'
import * as vscode from 'vscode'
import { registerAgentILSCommands } from './commands'
import { registerAgentILSChatParticipant } from './chat-participant'
import { LocalPanelInteractionChannel } from './interaction-channel/local-panel-channel'
import { registerAgentILSLanguageModelTools } from './lm-tools'
import { initLogger, log } from './logger'
import { JsonlLogger } from './jsonl-logger'
import { AgentILSMcpElicitationBridge } from './mcp-elicitation-bridge'
import { registerAgentILSPromptPackCommands } from './prompt-pack'
import { ConversationSessionManager } from './session/conversation-session-manager'
import { AgentILSStatusSurface } from './status-surface'
import { RepoBackedAgentILSTaskServiceClient } from './task-service-client'

function resolveMcpServerPath(context: vscode.ExtensionContext): string | null {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
  if (!workspaceFolder) {
    return null
  }
  const configured = vscode.workspace.getConfiguration('agentils').get<string>('runtime.serverModulePath')?.trim()
  if (configured) {
    return configured
  }
  // Prefer the sibling repo build output (development layout), then workspace package output.
  const candidates = [
    join(context.extensionPath, '..', '..', 'packages', 'mcp', 'dist', 'index.js'),
    join(workspaceFolder.uri.fsPath, 'packages', 'mcp', 'dist', 'index.js'),
    join(workspaceFolder.uri.fsPath, 'dist', 'index.js'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

export async function activate(context: vscode.ExtensionContext) {
  // 启用 JSONL 日志（默认启用以进行诊断）
  const debugMode = process.env.AGENTILS_DEBUG === 'true' || true  // 暂时默认启用
  if (debugMode) {
    JsonlLogger.enable()
  }
  JsonlLogger.info('extension', 'activate', 'Extension activating', { debugMode, logsDir: JsonlLogger.getLogsDir() })

  initLogger()
  log('activate', 'Extension activating')
  const client = new RepoBackedAgentILSTaskServiceClient(context)
  const sessionManager = new ConversationSessionManager(client)
  const interactionChannel = new LocalPanelInteractionChannel(context.extensionUri, sessionManager)
  const statusEnabled = vscode.workspace.getConfiguration('agentils').get<boolean>('taskConsole.showStatusBar') ?? true
  const status = new AgentILSStatusSurface(client, statusEnabled)

  const openConsole = interactionChannel.revealConsole.bind(interactionChannel)

  sessionManager.setInteractionChannel(interactionChannel)
  client.setElicitationHandler((params) => sessionManager.handleMcpElicitation(params))
  registerAgentILSCommands(context, sessionManager, openConsole)
  registerAgentILSChatParticipant(context, sessionManager)
  registerAgentILSLanguageModelTools(context, sessionManager)
  registerAgentILSPromptPackCommands(context)
  log('activate', 'Commands, chat participant, LM tools, prompt pack registered')

  // Diagnostic: enumerate all registered LM tools
  const toolNames = vscode.lm.tools.map(t => t.name)
  log('activate', `vscode.lm.tools (${toolNames.length} total)`, toolNames)

  // MCP Elicitation Bridge: connects to the AgentILS MCP server subprocess so
  // that server-side approval_request / feedback_gate tool elicitations are
  // dispatched to the WebView via sessionManager.
  const bridge = new AgentILSMcpElicitationBridge(context, sessionManager)
  context.subscriptions.push(client, status, sessionManager, interactionChannel, bridge)

  try {
    await sessionManager.refresh()
    log('activate', 'Initial refresh succeeded')
  } catch (error) {
    log('activate', 'Initial refresh failed', { error: error instanceof Error ? error.message : String(error) })
    vscode.window.showWarningMessage(
      error instanceof Error ? error.message : 'AgentILS runtime is unavailable. Build the workspace or start the HTTP debug server.',
    )
  }

  const mcpServerPath = resolveMcpServerPath(context)
  log('activate', 'MCP server path resolved', { mcpServerPath })
  if (mcpServerPath) {
    bridge.connect(mcpServerPath).then(() => {
      log('activate', 'MCP elicitation bridge connected')
    }).catch((error: unknown) => {
      log('activate', 'MCP elicitation bridge failed', { error: error instanceof Error ? error.message : String(error) })
      vscode.window.showWarningMessage(
        `AgentILS MCP elicitation bridge failed to connect: ${error instanceof Error ? error.message : String(error)}`,
      )
    })
  } else {
    log('activate', 'No MCP server path found — bridge skipped')
  }
  log('activate', 'Extension activation complete')
}

export function deactivate() {}
