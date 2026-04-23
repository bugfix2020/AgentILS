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
import { Orchestrator } from './orchestrator/orchestrator.js'
import { JsonStore } from './store/json-store.js'
import { startHttpBridge } from './transport/http.js'
import { startStdioTransport } from './transport/stdio.js'
import type { ServerOptions } from './types/index.js'

export { AgentilsClient } from './client/index.js'
export { Orchestrator } from './orchestrator/orchestrator.js'
export { JsonStore } from './store/json-store.js'
export type * from './types/index.js'

export interface RunningServer {
  orchestrator: Orchestrator
  store: JsonStore
  http?: { port: number; close: () => Promise<void> }
  stop: () => Promise<void>
}

const DEFAULT_HEARTBEAT_TIMEOUT = 5 * 60_000
const DEFAULT_HTTP_PORT = 8788
const SWEEP_INTERVAL = 30_000

export async function startAgentilsServer(
  opts: ServerOptions & { stdio?: boolean; http?: boolean } = {},
): Promise<RunningServer> {
  const statePath = opts.statePath ?? join(homedir(), '.agentils', 'state.json')
  const store = new JsonStore(statePath)
  await store.load()
  const orchestrator = new Orchestrator(
    store,
    opts.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT,
  )

  const sweep = setInterval(() => {
    void orchestrator.sweepExpired()
  }, SWEEP_INTERVAL)

  let http: RunningServer['http']
  if (opts.http !== false) {
    const handle = await startHttpBridge(orchestrator, opts.httpPort ?? DEFAULT_HTTP_PORT)
    http = { port: handle.port, close: handle.close }
  }
  if (opts.stdio) {
    void startStdioTransport(orchestrator)
  }

  return {
    orchestrator,
    store,
    http,
    stop: async () => {
      clearInterval(sweep)
      if (http) await http.close()
    },
  }
}

// CLI entry
const isCli = import.meta.url === `file://${process.argv[1]}`
if (isCli) {
  const args = new Set(process.argv.slice(2))
  const stdio = args.has('--stdio') || (!args.has('--http') && !args.has('--http-only'))
  const http = !args.has('--stdio-only')
  startAgentilsServer({ stdio, http }).then((srv) => {
    if (srv.http) {
      // eslint-disable-next-line no-console
      console.error(`[agentils-mcp] http bridge listening on http://127.0.0.1:${srv.http.port}`)
    }
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[agentils-mcp] failed to start:', err)
    process.exit(1)
  })
}
