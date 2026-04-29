import type { Server as HttpServer } from 'node:http'
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { randomUUID } from 'node:crypto'
import { defaultConfig, type AgentGateConfig } from '../config/defaults.js'
import { mcpLogger } from '../logger.js'
import { AgentGateOrchestrator } from '../orchestrator/orchestrator.js'
import { AgentGateMemoryStore } from '../store/memory-store.js'
import { acquireRuntimeLock, updateLockPort } from '../runtime/lock.js'
import { createAgentGateServer } from './server.js'
import type { AgentGateHttpRuntime } from './context.js'

export async function startStdioServer(config: AgentGateConfig = defaultConfig) {
  process.stdin.resume()
  mcpLogger.info('gateway/transports', 'startStdioServer', {
    env: process.env.AGENTILS_ENV ?? null,
  })
  const runtime = createAgentGateServer(config)
  const transport = new StdioServerTransport()
  transport.onclose = () => {
    mcpLogger.info('gateway/transports', 'stdio:onclose')
    process.exit(0)
  }
  await runtime.server.connect(transport)
  mcpLogger.info('gateway/transports', 'stdio:connected')
  return runtime
}

export async function startStreamableHttpServer(
  config: AgentGateConfig = defaultConfig,
  options: { host?: string; port?: number; endpoint?: string } = {},
): Promise<AgentGateHttpRuntime> {
  const host = options.host ?? '127.0.0.1'
  const port = options.port ?? 8788
  const endpoint = options.endpoint ?? '/mcp'
  const store = new AgentGateMemoryStore()
  const orchestrator = new AgentGateOrchestrator(store)
  const app = createMcpExpressApp({ host })
  const transports: Record<string, StreamableHTTPServerTransport> = {}

  app.get('/health', (_req: unknown, res: { json: (body: unknown) => void }) => {
    res.json({ ok: true, name: config.serverName, endpoint })
  })

  app.post(endpoint, async (req: any, res: any) => {
    mcpLogger.debug('gateway/transports', 'http:post', {
      endpoint,
      hasSessionId: Boolean(req.headers['mcp-session-id']),
    })
    const header = req.headers['mcp-session-id']
    const sessionId = Array.isArray(header) ? header[0] : header
    let transport = sessionId ? transports[sessionId] : undefined

    if (!transport && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (initializedSessionId) => {
          transports[initializedSessionId] = transport!
        },
      })
      const runtime = createAgentGateServer(config, { store, orchestrator })
      transport.onclose = () => {
        mcpLogger.info('gateway/transports', 'http:onclose', {
          sessionId: transport?.sessionId ?? null,
        })
        // Bug A fix: release this runtime's notifier so the orchestrator
        // stops fanning out push updates to a dead transport.
        runtime.disposeNotifier()
        if (transport?.sessionId) {
          delete transports[transport.sessionId]
        }
      }
      await runtime.server.connect(transport)
    }

    if (!transport) {
      res.status(400).json({ error: 'Missing MCP session' })
      return
    }

    await transport.handleRequest(req, res, req.body)
  })

  app.get(endpoint, async (req: any, res: any) => {
    const header = req.headers['mcp-session-id']
    const sessionId = Array.isArray(header) ? header[0] : header
    const transport = sessionId ? transports[sessionId] : undefined
    if (!transport) {
      res.status(400).send('Missing MCP session')
      return
    }
    await transport.handleRequest(req, res)
  })

  app.delete(endpoint, async (req: any, res: any) => {
    const header = req.headers['mcp-session-id']
    const sessionId = Array.isArray(header) ? header[0] : header
    const transport = sessionId ? transports[sessionId] : undefined
    if (!transport) {
      res.status(400).send('Missing MCP session')
      return
    }
    await transport.handleRequest(req, res)
  })

  // Bug I fix: lock.ts pickFreePort releases the port between probing
  // and our actual listen, leaving a TOCTOU window. If listen fails with
  // EADDRINUSE, fall back to OS-assigned port (port 0) and surface the
  // real port via boundPort below.
  const server = await new Promise<HttpServer>((resolve, reject) => {
    const tryListen = (p: number) => {
      const httpServer = app.listen(p, host)
      httpServer.once('listening', () => resolve(httpServer))
      httpServer.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && p !== 0) {
          mcpLogger.info('gateway/transports', 'http:eaddrinuse-retry', { port: p })
          tryListen(0)
          return
        }
        reject(err)
      })
    }
    tryListen(port)
  })
  // When `port: 0` is passed (test scenarios) we must surface the actual
  // OS-assigned port, not the placeholder, so callers get a valid URL.
  const addr = server.address()
  const boundPort =
    typeof addr === 'object' && addr && 'port' in addr ? addr.port : port

  return {
    store,
    orchestrator,
    config,
    host,
    port: boundPort,
    url: `http://${host}:${boundPort}${endpoint}`,
    close: async () => {
      mcpLogger.info('gateway/transports', 'http:close')
      await Promise.all(Object.values(transports).map((transport) => transport.close().catch(() => undefined)))
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
    },
  }
}

export async function startIfEntrypoint(): Promise<void> {
  const invokedPath = process.argv[1] ?? ''
  const isDirectEntrypoint =
    invokedPath.endsWith('/src/index.ts') ||
    invokedPath.endsWith('\\src\\index.ts') ||
    invokedPath.endsWith('/dist/index.js') ||
    invokedPath.endsWith('\\dist\\index.js') ||
    invokedPath === 'src/index.ts' ||
    invokedPath === 'dist/index.js'

  if (!isDirectEntrypoint) {
    return
  }

  // Phase 1: HTTP is the default transport. stdio remains opt-in via --stdio
  // for legacy clients only.
  if (process.argv.includes('--stdio')) {
    mcpLogger.info('gateway/transports', 'startIfEntrypoint:stdio')
    await startStdioServer()
    return
  }

  mcpLogger.info('gateway/transports', 'startIfEntrypoint:http')
  const lock = await acquireRuntimeLock({})
  if (!lock.isOwner) {
    // Another live MCP server already owns this workspace — print its URL and exit.
    console.log(`AgentILS HTTP server already running at ${lock.info.url} (pid ${lock.info.pid})`)
    return
  }

  const runtime = await startStreamableHttpServer(defaultConfig, {
    host: lock.info.host,
    port: lock.info.port,
    endpoint: lock.info.endpoint,
  })

  // Bug I fix: if EADDRINUSE retry picked a different port, refresh the
  // lock file so peers (extension, Copilot via mcp.json sync) see the
  // truth.
  if (runtime.port !== lock.info.port) {
    updateLockPort(lock.lockPath, lock.info, runtime.port)
    mcpLogger.info('gateway/transports', 'startIfEntrypoint:port-rewritten', {
      reserved: lock.info.port,
      bound: runtime.port,
    })
  }

  const cleanup = () => {
    lock.release()
    runtime.close().catch(() => undefined)
  }
  process.once('SIGINT', () => {
    cleanup()
    process.exit(0)
  })
  process.once('SIGTERM', () => {
    cleanup()
    process.exit(0)
  })
  process.once('exit', () => lock.release())

  console.log(`AgentILS HTTP server listening at ${runtime.url}`)
}
