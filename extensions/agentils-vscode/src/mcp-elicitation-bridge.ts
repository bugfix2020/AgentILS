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
import type { AgentILSMcpElicitationParams, AgentILSMcpElicitationResult } from './model'
import type { ConversationSessionManager } from './session/conversation-session-manager'

// Lazily loaded MCP SDK types — imported via require() to avoid static import
// failures if the dependency is missing at type-check time in CI.
// When @modelcontextprotocol/sdk is properly installed these resolve correctly.
type McpClient = any
type McpTransport = any

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
      async (request: { params?: AgentILSMcpElicitationParams }) => {
        return this._handleElicitation(request.params ?? {})
      },
    )

    await this.client.connect(this.transport)
    log('mcp-bridge', 'MCP client connected to server', { serverPath })
  }

  private async _handleElicitation(params: AgentILSMcpElicitationParams): Promise<AgentILSMcpElicitationResult> {
    log('mcp-bridge', 'elicitation received', {
      mode: params.mode,
      interactionKind: params._meta?.agentilsInteractionKind,
      runId: params.runId,
    })
    return this.sessionManager.handleMcpElicitation(params)
  }

  dispose() {
    if (this.client) {
      this.client.close().catch(() => {})
    }
    this.client = null
    this.transport = null
  }
}
