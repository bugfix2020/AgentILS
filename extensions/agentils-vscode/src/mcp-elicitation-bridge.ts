/**
 * AgentILS MCP Elicitation Bridge
 *
 * Starts the AgentILS MCP server as a stdio child process and connects to it
 * as an MCP client. When the server sends an elicitation/create request
 * (triggered by `approval_request` or `feedback_gate` tools), this bridge
 * dispatches the interaction to the VS Code WebView via ConversationSessionManager.
 *
 * DEPENDENCY NOTE:
 *   `@modelcontextprotocol/sdk` is NOT listed in extensions/agentils-vscode/package.json.
 *   It must be added for VSIX packaging:
 *     "dependencies": { "@modelcontextprotocol/sdk": "^1.27.1" }
 *
 *   During development the root package.json's node_modules are found via Node
 *   module resolution traversal, so the build and runtime both work. For VSIX
 *   packaging the extension must declare its own dependency.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as vscode from 'vscode'

import { log } from './logger'
import type { ConversationSessionManager } from './session/conversation-session-manager'

// Lazily loaded MCP SDK types — imported via require() to avoid static import
// failures if the dependency is missing at type-check time in CI.
// When @modelcontextprotocol/sdk is properly installed these resolve correctly.
type McpClient = any
type McpTransport = any

interface ElicitationParams {
  mode?: string
  message?: string
  summary?: string
  riskLevel?: 'low' | 'medium' | 'high'
  targets?: string[]
  runId?: string
  requestedSchema?: Record<string, unknown>
  [key: string]: unknown
}

interface ElicitationResult {
  action: string
  content?: Record<string, unknown> | null
}

export class AgentILSMcpElicitationBridge implements vscode.Disposable {
  private client: McpClient | null = null
  private transport: McpTransport | null = null

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly sessionManager: ConversationSessionManager,
  ) {}

  /**
   * Spawns the AgentILS MCP server at `serverPath` and connects as an MCP
   * client with elicitation capability enabled.
   *
   * @param serverPath Absolute path to the built AgentILS MCP server entry
   *   point (typically `<workspace>/packages/mcp/dist/index.js`).
   */
  async connect(serverPath: string): Promise<void> {
    if (this.client) {
      return
    }

    // Dynamically require the SDK so that a missing dependency results in a
    // runtime warning rather than extension load failure.
    let Client: any
    let StdioClientTransport: any
    let ElicitRequestSchema: any
    try {
      Client = require('@modelcontextprotocol/sdk/client/index.js').Client
      StdioClientTransport = require('@modelcontextprotocol/sdk/client/stdio.js').StdioClientTransport
      ElicitRequestSchema = require('@modelcontextprotocol/sdk/types.js').ElicitRequestSchema
    } catch (err) {
      throw new Error(
        `AgentILS MCP elicitation bridge requires @modelcontextprotocol/sdk. ` +
          `Add "dependencies": { "@modelcontextprotocol/sdk": "^1.27.1" } to ` +
          `extensions/agentils-vscode/package.json. Underlying error: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    this.transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
    })

    this.client = new Client(
      { name: 'agentils-vscode-bridge', version: '0.1.0' },
      {
        capabilities: {
          // Declare elicitation capability so the server knows this client
          // can handle elicitation/create requests.
          elicitation: {},
        },
      },
    )

    // Register the elicitation handler.
    // The server calls runtime.server.server.elicitInput(params) which emits
    // an "elicitation/create" JSON-RPC request back to this client.
    // AgentGateElicitParams in packages/mcp/src/gateway/context.ts defines the shape:
    //   { mode, message/summary, riskLevel?, targets?, runId?, requestedSchema? }
    // The handler must return AgentGateElicitResult: { action, content? }
    this.client.setRequestHandler(
      ElicitRequestSchema,
      async (request: { params?: ElicitationParams }) => {
        return this._handleElicitation(request.params ?? {})
      },
    )

    await this.client.connect(this.transport)
    log('mcp-bridge', 'MCP client connected to server', { serverPath })
  }

  private async _handleElicitation(params: ElicitationParams): Promise<ElicitationResult> {
    log('mcp-bridge', 'elicitation received', { mode: params.mode, runId: params.runId })
    const mode = params.mode ?? ''
    const summary = params.message ?? params.summary ?? ''
    const riskLevel = (params.riskLevel as 'low' | 'medium' | 'high') ?? 'medium'
    const targets = Array.isArray(params.targets) ? params.targets : []
    const runId = typeof params.runId === 'string' ? params.runId : undefined

    if (mode === 'approval') {
      return this._handleApproval({ summary, riskLevel, targets, runId })
    }

    // 'feedback' or empty string → feedback gate
    return this._handleFeedback({ summary, runId })
  }

  private async _handleApproval(input: {
    summary: string
    riskLevel: 'low' | 'medium' | 'high'
    targets: string[]
    runId: string | undefined
  }): Promise<ElicitationResult> {
    try {
      const result = await this.sessionManager.requestApproval({
        summary: input.summary,
        riskLevel: input.riskLevel,
        targets: input.targets,
        preferredRunId: input.runId,
      })
      return {
        action: result.action,
        content: { status: result.status, msg: result.message },
      }
    } catch {
      return { action: 'cancel', content: null }
    }
  }

  private async _handleFeedback(input: {
    summary: string
    runId: string | undefined
  }): Promise<ElicitationResult> {
    try {
      const result = await this.sessionManager.requestFeedback({
        question: input.summary,
        summary: input.summary,
        preferredRunId: input.runId,
      })
      return {
        action: 'accepted',
        content: { status: result.status, msg: result.message },
      }
    } catch {
      return { action: 'cancel', content: null }
    }
  }

  dispose() {
    if (this.client) {
      this.client.close().catch(() => {})
    }
    this.client = null
    this.transport = null
  }
}
