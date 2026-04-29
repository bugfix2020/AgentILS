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
import { registerTools, REGISTERED_LM_IDS } from './tools/registerTools.js'
import { AgentilsWebviewManager } from './webview/manager.js'
import { createExtensionLogger } from './logging.js'

let server: RunningServer | undefined
let webviewManager: AgentilsWebviewManager | undefined

const DEFAULT_MCP_HEARTBEAT_TIMEOUT_MS = 60 * 60_000
const DEFAULT_MCP_SWEEP_INTERVAL_MS = 30_000

/**
 * Public extension API surface (consumable via `extension.exports`).
 *
 * `recentLogs()` returns the in-memory ring-buffer mirror of the OutputChannel
 * (last 500 lines) so tests / external observers don't need to scrape the UI.
 *
 * `triggerSweep()` fires the orchestrator expiry sweep on demand — used by
 * the heartbeat-timeout test instead of waiting for the periodic timer.
 */
export interface AgentilsExtensionApi {
    baseUrl: string
    toolNames: string[]
    recentLogs: () => string[]
    triggerSweep: () => Promise<void>
    openWebview: () => vscode.WebviewPanel
}

const LOG_RING_CAPACITY = 500

function createMirroredChannel(): { channel: vscode.OutputChannel; ring: string[] } {
    const real = vscode.window.createOutputChannel('AgentILS')
    const ring: string[] = []
    const wrapped: vscode.OutputChannel = {
        name: real.name,
        append: (v) => real.append(v),
        appendLine: (line) => {
            real.appendLine(line)
            ring.push(line)
            if (ring.length > LOG_RING_CAPACITY) ring.shift()
        },
        clear: () => {
            real.clear()
            ring.length = 0
        },
        show: real.show.bind(real) as vscode.OutputChannel['show'],
        hide: () => real.hide(),
        replace: (v) => real.replace(v),
        dispose: () => real.dispose(),
    }
    return { channel: wrapped, ring }
}

export async function activate(context: vscode.ExtensionContext): Promise<AgentilsExtensionApi> {
    const { channel, ring } = createMirroredChannel()
    context.subscriptions.push(channel)
    const log = createExtensionLogger(channel, 'extension')
    log.info('extension activate begin', {
        operation: 'activation.begin',
        extensionPath: context.extensionPath,
        extensionUri: context.extensionUri.toString(),
        vsCodeVersion: vscode.version,
    })

    const cfg = vscode.workspace.getConfiguration('agentils')
    const autoStart = cfg.get<boolean>('mcp.autoStart', true)

    let baseUrl = cfg.get<string>('mcp.httpUrl', 'http://127.0.0.1:8788')

    const heartbeatTimeoutMs = positiveMs(
        process.env.AGENTILS_TEST_HEARTBEAT_MS
            ? Number(process.env.AGENTILS_TEST_HEARTBEAT_MS)
            : cfg.get<number>('mcp.heartbeatTimeoutMs'),
        DEFAULT_MCP_HEARTBEAT_TIMEOUT_MS,
    )
    const sweepIntervalMs = positiveMs(
        process.env.AGENTILS_TEST_SWEEP_MS
            ? Number(process.env.AGENTILS_TEST_SWEEP_MS)
            : cfg.get<number>('mcp.sweepIntervalMs'),
        DEFAULT_MCP_SWEEP_INTERVAL_MS,
    )
    const statePath = process.env.AGENTILS_TEST_STATE_PATH

    if (autoStart) {
        log.info('MCP bridge start begin', {
            operation: 'mcp.bridge.start.begin',
            autoStart,
            heartbeatTimeoutMs,
            sweepIntervalMs,
        })
        try {
            server = await startAgentilsServer({
                stdio: false,
                http: true,
                httpPort: 0,
                statePath,
                heartbeatTimeoutMs,
                sweepIntervalMs,
            })
            if (server.http) baseUrl = `http://127.0.0.1:${server.http.port}`
            log.info('MCP bridge start end', {
                operation: 'mcp.bridge.start.end',
                baseUrl,
                httpPort: server.http?.port,
            })
        } catch (err) {
            log.error('MCP bridge start error', {
                operation: 'mcp.bridge.start.error',
                error: (err as Error).message,
            })
            throw err
        }
    } else {
        log.info('MCP bridge external selected', {
            operation: 'mcp.bridge.external.selected',
            baseUrl,
        })
    }

    const client = new AgentilsClient({ baseUrl })
    const healthy = await client.health()
    log.info('MCP bridge connect result', {
        operation: 'mcp.bridge.connect.result',
        baseUrl,
        healthy,
    })

    const webviewLog = createExtensionLogger(channel, 'webview')
    webviewManager = new AgentilsWebviewManager(context, baseUrl, webviewLog)

    context.subscriptions.push(
        vscode.commands.registerCommand('agentils.openPanel', () => {
            log.info('open panel command invoked', {
                operation: 'command.agentils.openPanel',
                baseUrl,
            })
            return webviewManager?.ensurePanel()
        }),
    )

    context.subscriptions.push(
        vscode.commands.registerCommand('agentils.mcp.testConnection', async () => {
            const ok = await client.health()
            log.info('test connection command result', {
                operation: 'command.agentils.mcp.testConnection',
                baseUrl,
                healthy: ok,
            })
            const message = ok
                ? `AgentILS MCP bridge is reachable at ${baseUrl}`
                : `AgentILS MCP bridge is not reachable at ${baseUrl}`
            await vscode.window.showInformationMessage(message)
            return ok
        }),
    )

    registerTools(context, client, webviewManager, channel)
    log.info('extension activate done', {
        operation: 'activation.end',
        baseUrl,
        toolNames: REGISTERED_LM_IDS,
    })
    return {
        baseUrl,
        toolNames: REGISTERED_LM_IDS,
        recentLogs: () => ring.slice(),
        triggerSweep: async () => {
            if (server) await server.orchestrator.sweepExpired()
        },
        openWebview: () => {
            if (!webviewManager) throw new Error('webview manager not initialised')
            return webviewManager.ensurePanel()
        },
    }
}

export async function deactivate(): Promise<void> {
    webviewManager?.dispose()
    if (server) {
        await server.stop()
        server = undefined
    }
}

function positiveMs(value: number | undefined, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}
