/**
 * AgentILS MCP server — entry point.
 *
 * CLI flags:
 *   --stdio   : run only the MCP stdio transport (default if no flag)
 *   --http    : run only the HTTP bridge
 *   (both)    : run both transports together (recommended for VS Code)
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Orchestrator } from './orchestrator/orchestrator.js'
import { MemoryStore } from './store/memory-store.js'
import { startHttpBridge } from './transport/http.js'
import { startStdioTransport } from './transport/stdio.js'
import type { ServerOptions } from './types/index.js'
import { createLogger, startHttpLogServer, type HttpLogServerHandle } from './util/logger.js'

export { AgentilsClient } from './client/index.js'
export { Orchestrator } from './orchestrator/orchestrator.js'
export { JsonStore } from './store/json-store.js'
export { MemoryStore } from './store/memory-store.js'
export { createLogger } from './util/logger.js'
export type * from './types/index.js'

const log = createLogger('boot')

export interface RunningServer {
    orchestrator: Orchestrator
    store: MemoryStore
    http?: { port: number; close: () => Promise<void> }
    logServer?: HttpLogServerHandle
    stop: () => Promise<void>
}

const DEFAULT_HEARTBEAT_TIMEOUT = 60 * 60_000
const DEFAULT_HTTP_PORT = 8788
const DEFAULT_LOG_PORT = 12138
const DEFAULT_SWEEP_INTERVAL = 30_000

export async function startAgentilsServer(
    opts: ServerOptions & { stdio?: boolean; http?: boolean; sweepIntervalMs?: number } = {},
): Promise<RunningServer> {
    const statePath = opts.statePath ?? join(homedir(), '.agentils', 'state.json')
    const sweepIntervalMs = opts.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL

    let logServer: HttpLogServerHandle | undefined
    if (opts.logServer !== false) {
        try {
            logServer = await startHttpLogServer({
                port: opts.logPort ?? DEFAULT_LOG_PORT,
                logDir: opts.logDir,
            })
            log.info('http log server ready', {
                operation: 'logger.start',
                status: 'ready',
                url: logServer.url,
                logDir: logServer.logDir,
                httpPort: logServer.port,
            })
        } catch (err) {
            log.warn('http log server unavailable', {
                operation: 'logger.start',
                status: 'failed',
                httpPort: opts.logPort ?? DEFAULT_LOG_PORT,
                error: err,
            })
        }
    }

    log.info('starting agentils server', {
        operation: 'server.start',
        statePath,
        stateStorage: 'memory',
        httpPort: opts.httpPort,
        logPort: opts.logPort ?? DEFAULT_LOG_PORT,
        logServer: opts.logServer !== false,
        stdio: !!opts.stdio,
        http: opts.http !== false,
        heartbeatTimeoutMs: opts.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT,
        sweepIntervalMs,
    })
    const store = new MemoryStore()
    await store.load()
    const orchestrator = new Orchestrator(store, opts.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT)

    const sweep = setInterval(() => {
        void orchestrator.sweepExpired()
    }, sweepIntervalMs)

    let http: RunningServer['http']
    if (opts.http !== false) {
        const handle = await startHttpBridge(orchestrator, opts.httpPort ?? DEFAULT_HTTP_PORT)
        http = { port: handle.port, close: handle.close }
        log.info('http bridge ready', {
            operation: 'http.start',
            status: 'ready',
            httpPort: handle.port,
        })
    }
    if (opts.stdio) {
        void startStdioTransport(orchestrator)
        log.info('stdio transport requested', {
            operation: 'stdio.start',
            status: 'requested',
        })
    }

    return {
        orchestrator,
        store,
        http,
        logServer,
        stop: async () => {
            clearInterval(sweep)
            if (http) await http.close()
            log.info('server stopped', {
                operation: 'server.stop',
                status: 'stopped',
            })
            if (logServer) await logServer.close()
        },
    }
}

// CLI entry — fixed for Windows: compare with `pathToFileURL(process.argv[1]).href`
// instead of the buggy `´file://${process.argv[1]}´` concatenation that fails on
// Windows (path with backslashes + missing third slash + no percent-encoding).
const entry = process.argv[1]
const isCli = !!entry && import.meta.url === pathToFileURL(entry).href
log.debug('cli detection', { isCli, entry, importMetaUrl: import.meta.url })
if (isCli) {
    const args = new Set(process.argv.slice(2))
    const stdio = args.has('--stdio') || (!args.has('--http') && !args.has('--http-only'))
    const http = !args.has('--stdio-only')
    startAgentilsServer({ stdio, http })
        .then((srv) => {
            if (srv.http) {
                // eslint-disable-next-line no-console
                console.error(`[agentils-mcp] http bridge listening on http://127.0.0.1:${srv.http.port}`)
            }
        })
        .catch((err) => {
            log.error('cli startup failed', { error: (err as Error).message })
            process.exit(1)
        })
}
