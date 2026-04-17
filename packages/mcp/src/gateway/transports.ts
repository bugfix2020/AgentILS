import { randomUUID } from 'node:crypto'
import type { Server as HttpServer } from 'node:http'
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import express from 'express'
import { defaultConfig, type AgentGateConfig } from '../config/defaults.js'
import * as uiActions from '../control-plane/ui-actions.js'
import { AgentGateMemoryStore } from '../store/memory-store.js'
import { AgentGateOrchestrator } from '../orchestrator/orchestrator.js'
import { createAgentGateServer } from './server.js'
import type { AgentGateHttpRuntime } from './context.js'

export async function startStdioServer(config: AgentGateConfig = defaultConfig) {
  // Prevent the event loop from exiting while stdin is open.
  // Node.js pauses stdin by default; without resume() some environments
  // treat it as idle and allow the process to exit, giving VS Code an EOF.
  process.stdin.resume()

  // Route unhandled errors to stderr so they never corrupt the MCP
  // length-prefixed framing on stdout.
  process.on('uncaughtException', (err) => {
    process.stderr.write(
      `[AgentILS MCP Server] Uncaught exception: ${err.stack ?? err.message}\n`,
    )
  })
  process.on('unhandledRejection', (reason) => {
    process.stderr.write(`[AgentILS MCP Server] Unhandled rejection: ${String(reason)}\n`)
  })

  const runtime = createAgentGateServer(config)
  const transport = new StdioServerTransport()

  // When the transport closes (stdin EOF or client disconnect), exit cleanly
  // so VS Code can re-spawn the process and reconnect without stale state.
  transport.onclose = () => {
    process.stderr.write(
      '[AgentILS MCP Server] stdio transport closed – exiting to allow client reconnect\n',
    )
    process.exit(0)
  }

  await runtime.server.connect(transport)
  return runtime
}

export async function startStreamableHttpServer(
  config: AgentGateConfig = defaultConfig,
  options: {
    host?: string
    port?: number
    endpoint?: string
  } = {},
): Promise<AgentGateHttpRuntime> {
  const host = options.host ?? process.env.AGENT_GATE_HTTP_HOST ?? '127.0.0.1'
  const port = options.port ?? Number.parseInt(process.env.AGENT_GATE_HTTP_PORT ?? '8788', 10)
  const endpoint = options.endpoint ?? '/mcp'

  const store = new AgentGateMemoryStore()
  const orchestrator = new AgentGateOrchestrator(store)
  const app = createMcpExpressApp({ host })
  const transports: Record<string, StreamableHTTPServerTransport> = {}

  app.get('/health', (_req: unknown, res: { json: (body: unknown) => void }) => {
    res.json({
      ok: true,
      name: config.serverName,
      transport: 'streamable-http',
      endpoint,
    })
  })

  const postHandler = async (req: any, res: any) => {
    const sessionIdHeader = req.headers['mcp-session-id']
    const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader

    try {
      let transport: StreamableHTTPServerTransport | undefined

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId]
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (initializedSessionId) => {
            transports[initializedSessionId] = transport!
          },
        })

        transport.onclose = () => {
          const activeSessionId = transport?.sessionId
          if (activeSessionId) {
            delete transports[activeSessionId]
          }
        }

        const runtime = createAgentGateServer(config, { store, orchestrator })
        await runtime.server.connect(transport)
        await transport.handleRequest(req, res, req.body)
        return
      } else {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid MCP session or initialize request provided',
          },
          id: null,
        })
        return
      }

      await transport.handleRequest(req, res, req.body)
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : 'Internal server error',
          },
          id: null,
        })
      }
    }
  }

  const getHandler = async (req: any, res: any) => {
    const sessionIdHeader = req.headers['mcp-session-id']
    const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader

    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing MCP session ID')
      return
    }

    await transports[sessionId].handleRequest(req, res)
  }

  const deleteHandler = async (req: any, res: any) => {
    const sessionIdHeader = req.headers['mcp-session-id']
    const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader

    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing MCP session ID')
      return
    }

    await transports[sessionId].handleRequest(req, res)
  }

  app.post(endpoint, postHandler)
  app.get(endpoint, getHandler)
  app.delete(endpoint, deleteHandler)

  const uiServices = uiActions.buildUiActionServices(store, orchestrator)
  const uiRouter = express.Router()
  uiRouter.use(express.json())
  
  uiRouter.post('/snapshot', (req, res) => res.json(uiActions.buildUiRuntimeSnapshot(req.body, uiServices)))
  uiRouter.post('/start_task', (req, res) => res.json(uiActions.startUiTask(req.body, uiServices)))
  uiRouter.post('/continue_task', (req, res) => res.json(uiActions.continueUiTask(req.body, uiServices)))
  uiRouter.post('/override', (req, res) => res.json(uiActions.acceptUiOverride(req.body, uiServices)))
  uiRouter.post('/approval/begin', (req, res) => res.json(uiActions.beginUiApproval(req.body, uiServices)))
  uiRouter.post('/approval/record', (req, res) => res.json(uiActions.recordUiApproval(req.body, uiServices)))
  uiRouter.post('/feedback/record', (req, res) => res.json(uiActions.recordUiFeedback(req.body, uiServices)))
  uiRouter.post('/mark_done', (req, res) => res.json(uiActions.markUiTaskDone(req.body, uiServices)))
  uiRouter.post('/end_conversation', (req, res) => res.json(uiActions.endUiConversation(req.body, uiServices)))
  uiRouter.post('/finish_conversation', (req, res) => res.json(uiActions.finishUiConversation(req.body, uiServices)))

  app.use('/api/ui', uiRouter)

  const server = await new Promise<HttpServer>((resolve, reject) => {
    const httpServer = app.listen(port, host, () => resolve(httpServer))
    httpServer.on('error', reject)
  })

  const close = async () => {
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
  }

  return {
    store,
    orchestrator,
    config,
    host,
    port,
    url: `http://${host}:${port}${endpoint}`,
    close,
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

  if (process.argv.includes('--http')) {
    const runtime = await startStreamableHttpServer()
    console.log(`AgentILS Streamable HTTP server listening at ${runtime.url}`)
    return
  }

  await startStdioServer()
}
