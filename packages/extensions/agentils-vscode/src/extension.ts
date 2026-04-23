/**
 * AgentILS VS Code extension entry.
 *
 * Responsibilities (kept minimal — the heavy lifting lives in @agentils/mcp):
 *  1. Auto-start the in-process MCP HTTP bridge so the webview can connect.
 *  2. Register the four LM tools and route invocations through the MCP
 *     orchestrator (so a single tool call can host multi-turn UI interaction
 *     without re-billing).
 *  3. Open the AgentILS webview panel (loaded from `apps/webview/dist`).
 */
import * as vscode from 'vscode'
import { startAgentilsServer, type RunningServer } from '@agentils/mcp'
import { AgentilsClient } from '@agentils/mcp/client'
import { registerTools } from './tools/registerTools.js'
import { AgentilsWebviewManager } from './webview/manager.js'

let server: RunningServer | undefined
let webviewManager: AgentilsWebviewManager | undefined

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const channel = vscode.window.createOutputChannel('AgentILS')
  context.subscriptions.push(channel)

  const cfg = vscode.workspace.getConfiguration('agentils')
  const autoStart = cfg.get<boolean>('mcp.autoStart', true)

  let baseUrl = cfg.get<string>('mcp.httpUrl', 'http://127.0.0.1:8788')

  if (autoStart) {
    server = await startAgentilsServer({ stdio: false, http: true })
    if (server.http) baseUrl = `http://127.0.0.1:${server.http.port}`
    channel.appendLine(`[AgentILS] MCP HTTP bridge ready at ${baseUrl}`)
  }

  const client = new AgentilsClient({ baseUrl })
  webviewManager = new AgentilsWebviewManager(context, baseUrl, channel)

  registerTools(context, client, webviewManager, channel)
}

export async function deactivate(): Promise<void> {
  webviewManager?.dispose()
  if (server) {
    await server.stop()
    server = undefined
  }
}
