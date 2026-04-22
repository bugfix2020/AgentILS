import { existsSync } from 'node:fs'
import { join } from 'node:path'
import * as vscode from 'vscode'
import { extensionLogger, resolveAgentilsEnv } from './logger'
import type { RunTaskLoopInput, RunTaskLoopResult, StateSnapshot } from './types'

type McpClient = any
type McpTransport = any

function parseToolPayload<T>(result: { content?: Array<{ type?: string; text?: string }>; isError?: boolean }): T {
    const textPart = result.content?.find((item) => item.type === 'text' && typeof item.text === 'string')
    if (!textPart?.text) {
        throw new Error('AgentILS MCP tool returned no text payload.')
    }
    const separatorIndex = textPart.text.indexOf('\n')
    if (separatorIndex < 0) {
        throw new Error('AgentILS MCP tool returned an invalid text payload.')
    }
    if (result.isError) {
        throw new Error(textPart.text.slice(separatorIndex + 1).trim() || textPart.text)
    }
    return JSON.parse(textPart.text.slice(separatorIndex + 1)) as T
}

function resolveDefaultServerModulePath(context: vscode.ExtensionContext, workspaceRoot: string) {
    const candidates = [
        join(context.extensionPath, '..', '..', 'packages', 'mcp', 'dist', 'index.js'),
        join(workspaceRoot, 'packages', 'mcp', 'dist', 'index.js'),
    ]

    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            return candidate
        }
    }

    return join(workspaceRoot, 'dist', 'index.js')
}

function buildSpawnEnv() {
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
        if (typeof value === 'string') {
            env[key] = value
        }
    }
    const agentilsEnv = resolveAgentilsEnv()
    if (agentilsEnv) {
        env.AGENTILS_ENV = agentilsEnv
    }
    return env
}

export class AgentILSRuntimeClient implements vscode.Disposable {
    private localClient: McpClient | null = null
    private localTransport: McpTransport | null = null
    private readonly serverModulePath: string

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly workspaceRoot: string,
    ) {
        this.serverModulePath =
            vscode.workspace.getConfiguration('agentils').get<string>('runtime.serverModulePath')?.trim() ||
            resolveDefaultServerModulePath(context, workspaceRoot)
        extensionLogger.log('runtime-client', 'initialized', {
            workspaceRoot: this.workspaceRoot,
            serverModulePath: this.serverModulePath,
            agentilsEnv: resolveAgentilsEnv(),
        })
    }

    dispose() {
        void this.close()
    }

    async stateGet(taskId?: string): Promise<StateSnapshot> {
        extensionLogger.log('runtime-client', 'state_get:start', { taskId })
        return this.callTool<StateSnapshot>('state_get', taskId ? { taskId } : {})
    }

    async runTaskLoop(input: RunTaskLoopInput): Promise<RunTaskLoopResult> {
        extensionLogger.log('runtime-client', 'run_task_loop:start', input)
        return this.callTool<RunTaskLoopResult>('run_task_loop', input)
    }

    private async callTool<T>(name: string, payload: object): Promise<T> {
        const client = await this.ensureClient()
        extensionLogger.log('runtime-client', 'callTool', { name, payload })
        const result = await client.callTool({
            name,
            arguments: payload,
        })
        extensionLogger.log('runtime-client', 'callTool:rawResult', {
            name,
            hasContent: Array.isArray(result?.content),
        })
        return parseToolPayload<T>(result)
    }

    private async ensureClient(): Promise<McpClient> {
        if (this.localClient) {
            extensionLogger.log('runtime-client', 'ensureClient:reuse')
            return this.localClient
        }

        let Client: any
        let StdioClientTransport: any
        try {
            Client = require('@modelcontextprotocol/sdk/client/index.js').Client
            StdioClientTransport = require('@modelcontextprotocol/sdk/client/stdio.js').StdioClientTransport
        } catch (error) {
            throw new Error(`Failed to load MCP client SDK: ${String(error)}`)
        }

        this.localTransport = new StdioClientTransport({
            command: 'node',
            args: [this.serverModulePath],
            cwd: this.workspaceRoot,
            env: buildSpawnEnv(),
            stderr: 'pipe',
        })

        this.localClient = new Client({ name: 'agentils-vscode-client', version: '1.0.0' }, { capabilities: {} })

        extensionLogger.log('runtime-client', 'ensureClient:connect', { serverModulePath: this.serverModulePath })
        await this.localClient.connect(this.localTransport)
        extensionLogger.log('runtime-client', 'ensureClient:connected')
        return this.localClient
    }

    private async close() {
        if (this.localClient) {
            try {
                await this.localClient.close()
            } catch {
                // best effort
            }
        }
        this.localClient = null
        this.localTransport = null
    }
}
