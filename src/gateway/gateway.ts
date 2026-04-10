import { randomUUID } from 'node:crypto'
import type { Server as HttpServer } from 'node:http'
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { defaultConfig, type AgentGateConfig } from '../config/defaults.js'
import { AgentGateOrchestrator } from '../orchestrator/orchestrator.js'
import { AgentGateMemoryStore } from '../store/memory-store.js'
import { ApprovalResultSchema, FeedbackDecisionSchema, HandoffPacketSchema, TaskCardSchema } from '../types/index.js'

function asJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function textResult(label: string, value: unknown, isError = false) {
  return {
    content: [
      {
        type: 'text' as const,
        text: `${label}\n${asJson(value)}`,
      },
    ],
    isError,
  }
}

export interface AgentGateServerRuntime {
  server: McpServer
  store: AgentGateMemoryStore
  orchestrator: AgentGateOrchestrator
  config: AgentGateConfig
}

export interface AgentGateServerDependencies {
  store?: AgentGateMemoryStore
  orchestrator?: AgentGateOrchestrator
}

export interface AgentGateHttpRuntime {
  store: AgentGateMemoryStore
  orchestrator: AgentGateOrchestrator
  config: AgentGateConfig
  host: string
  port: number
  url: string
  close: () => Promise<void>
}

export function createAgentGateServer(
  config: AgentGateConfig = defaultConfig,
  dependencies: AgentGateServerDependencies = {},
): AgentGateServerRuntime {
  const store = dependencies.store ?? new AgentGateMemoryStore()
  const orchestrator = dependencies.orchestrator ?? new AgentGateOrchestrator(store)
  const server = new McpServer({
    name: config.serverName,
    version: config.serverVersion,
  })

  server.registerTool(
    'run_start',
    {
      description: 'Start a new AgentILS run with an explicit task goal and execution envelope.',
      inputSchema: {
        title: z.string().min(1),
        goal: z.string().min(1),
        scope: z.array(z.string()).optional(),
        constraints: z.array(z.string()).optional(),
        risks: z.array(z.string()).optional(),
        verificationRequirements: z.array(z.string()).optional(),
      },
    },
    async (input) => {
      const run = orchestrator.startRun(input)
      return textResult('Run started', run)
    },
  )

  server.registerTool(
    'run_get',
    {
      description: 'Read the current run state, defaulting to the latest persisted run.',
      inputSchema: {
        runId: z.string().optional(),
      },
    },
    async ({ runId }) => {
      const resolvedRunId = store.resolveRunId(runId)
      if (!resolvedRunId) {
        return textResult('Run state', { error: 'No run has been started yet.' }, true)
      }
      return textResult('Run state', store.requireRun(resolvedRunId))
    },
  )

  server.registerTool(
    'taskcard_get',
    {
      description: 'Read the taskCard for a run.',
      inputSchema: {
        runId: z.string().min(1),
      },
    },
    async ({ runId }) => textResult('TaskCard', store.requireTaskCard(runId)),
  )

  server.registerTool(
    'taskcard_put',
    {
      description: 'Create or update a taskCard for a run.',
      inputSchema: {
        runId: z.string().min(1),
        taskCard: z.any(),
      },
    },
    async ({ runId, taskCard }) => {
      const parsed = TaskCardSchema.parse({
        ...taskCard,
        runId,
      })
      return textResult('TaskCard updated', orchestrator.upsertTaskCard(parsed))
    },
  )

  server.registerTool(
    'handoff_get',
    {
      description: 'Read the handoff packet for a run.',
      inputSchema: {
        runId: z.string().min(1),
      },
    },
    async ({ runId }) => textResult('HandoffPacket', store.requireHandoff(runId)),
  )

  server.registerTool(
    'handoff_put',
    {
      description: 'Create or update a handoff packet for a run.',
      inputSchema: {
        runId: z.string().min(1),
        handoff: z.any(),
      },
    },
    async ({ runId, handoff }) => {
      const parsed = HandoffPacketSchema.parse({
        ...handoff,
        runId,
      })
      return textResult('Handoff updated', orchestrator.upsertHandoff(parsed))
    },
  )

  server.registerTool(
    'budget_check',
    {
      description: 'Evaluate a run against its budget and optionally apply usage deltas.',
      inputSchema: {
        runId: z.string().min(1),
        llmSteps: z.number().int().nonnegative().optional(),
        toolCalls: z.number().int().nonnegative().optional(),
        userResumes: z.number().int().nonnegative().optional(),
        tokens: z.number().int().nonnegative().optional(),
        apply: z.boolean().default(false),
      },
    },
    async ({ runId, llmSteps, toolCalls, userResumes, tokens, apply }) =>
      textResult(
        'Budget check',
        orchestrator.checkBudget(
          runId,
          {
            llmSteps,
            toolCalls,
            userResumes,
            tokens,
          },
          apply,
        ),
      ),
  )

  server.registerTool(
    'policy_check',
    {
      description: 'Evaluate whether a tool call is allowed and whether approval is required.',
      inputSchema: {
        runId: z.string().min(1),
        toolName: z.string().min(1),
        targets: z.array(z.string()).optional(),
      },
    },
    async ({ runId, toolName, targets }) =>
      textResult(
        'Policy check',
        orchestrator.evaluatePolicy(runId, toolName, targets ?? [], config.policy),
      ),
  )

  server.registerTool(
    'audit_append',
    {
      description: 'Append an audit event into the in-memory run log.',
      inputSchema: {
        runId: z.string().min(1),
        level: z.enum(['info', 'warn', 'error']),
        action: z.string().min(1),
        message: z.string().min(1),
        details: z.record(z.unknown()).optional(),
      },
    },
    async ({ runId, level, action, message, details }) =>
      textResult('Audit event appended', store.log(runId, level, action, message, details)),
  )

  server.registerTool(
    'verify_run',
    {
      description: 'Verify both the current result state and the handoff packet completeness.',
      inputSchema: {
        runId: z.string().min(1),
        userConfirmedDone: z.boolean().default(false),
      },
    },
    async ({ runId, userConfirmedDone }) =>
      textResult('Verify run', orchestrator.verifyRun(runId, userConfirmedDone)),
  )

  server.registerTool(
    'approval_request',
    {
      description: 'Pause for an explicit user approval decision before continuing a risky action.',
      inputSchema: {
        runId: z.string().min(1),
        summary: z.string().min(1),
        riskLevel: z.enum(['low', 'medium', 'high']).default('medium'),
        toolName: z.string().optional(),
        targets: z.array(z.string()).optional(),
      },
    },
    async ({ runId, summary, riskLevel, toolName, targets }) => {
      store.transitionRun(runId, 'approval', 'awaiting_approval')
      store.updateRun(runId, {
        activeApproval: {
          approved: false,
          action: 'cancel',
          summary,
          riskLevel,
          toolName,
          targets: targets ?? [],
          updatedAt: new Date().toISOString(),
        },
        verifyPassed: false,
      })

      const elicited = await server.server.elicitInput({
        mode: 'form',
        message: `Approval required (${riskLevel} risk): ${summary}`,
        requestedSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              title: 'Action',
              oneOf: [
                { const: 'accept', title: 'Accept' },
                { const: 'cancel', title: 'Cancel' },
                { const: 'decline', title: 'Decline' },
              ],
              default: 'accept',
            },
            status: {
              type: 'string',
              title: 'Next status',
              oneOf: [
                { const: 'continue', title: 'Continue' },
                { const: 'done', title: 'Done' },
                { const: 'revise', title: 'Revise' },
              ],
              default: 'continue',
            },
            msg: {
              type: 'string',
              title: 'Notes',
              description: 'Optional approval notes or revised boundary.',
            },
          },
          required: ['action', 'status'],
        },
      })

      if (elicited.action !== 'accept' || !elicited.content) {
        const fallback = {
          action: elicited.action,
        }
        orchestrator.recordApproval(runId, summary, fallback)
        return textResult('Approval result', fallback)
      }

      const result = ApprovalResultSchema.parse({
        action: elicited.content.action,
        payload: {
          status: elicited.content.status,
          msg: elicited.content.msg ?? '',
        },
      })

      store.updateRun(runId, {
        activeApproval: {
          approved: result.action === 'accept',
          action: result.action,
          summary,
          riskLevel,
          toolName,
          targets: targets ?? [],
          updatedAt: new Date().toISOString(),
        },
      })
      orchestrator.recordApproval(runId, summary, result)
      return textResult('Approval result', result)
    },
  )

  server.registerTool(
    'feedback_gate',
    {
      description: 'Collect continue/done/revise feedback using MCP elicitation.',
      inputSchema: {
        runId: z.string().min(1),
        summary: z.string().min(1),
      },
    },
    async ({ runId, summary }) => {
      const elicited = await server.server.elicitInput({
        mode: 'form',
        message: `Feedback gate: ${summary}`,
        requestedSchema: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              title: 'Status',
              oneOf: [
                { const: 'continue', title: 'Continue' },
                { const: 'done', title: 'Done' },
                { const: 'revise', title: 'Revise' },
              ],
              default: 'continue',
            },
            msg: {
              type: 'string',
              title: 'Notes',
              description: 'Optional notes for the next stage.',
            },
          },
          required: ['status'],
        },
      })

      if (elicited.action !== 'accept' || !elicited.content) {
        return textResult('Feedback result', { action: elicited.action })
      }

      const decision = FeedbackDecisionSchema.parse({
        status: elicited.content.status,
        msg: elicited.content.msg ?? '',
      })
      orchestrator.recordFeedback(runId, decision)
      return textResult('Feedback result', decision)
    },
  )

  server.registerPrompt(
    'agentgate_start_run',
    {
      description: 'Start a disciplined AgentILS run from the current context.',
      argsSchema: {
        goal: z.string().describe('The user goal for this run'),
      },
    },
    async ({ goal }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Start a new AgentILS run for the following goal: ${goal}. First classify the mode, then collect only the minimum blocking details, then persist taskCard state.`,
          },
        },
      ],
    }),
  )

  server.registerPrompt(
    'agentgate_resume_run',
    {
      description: 'Resume a run from its handoff packet.',
      argsSchema: {
        runId: z.string().describe('The run to resume'),
      },
    },
    async ({ runId }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Resume run ${runId}. Read the handoff packet and taskCard first, then continue from the recorded currentStep without re-discovering the whole task.`,
          },
        },
      ],
    }),
  )

  server.registerPrompt(
    'agentgate_verify_run',
    {
      description: 'Verify result and handoff before allowing completion.',
      argsSchema: {
        runId: z.string().describe('The run to verify'),
      },
    },
    async ({ runId }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Verify run ${runId}. Confirm result quality and handoff completeness. Do not treat natural-language confidence as done; use explicit verification output.`,
          },
        },
      ],
    }),
  )

  server.registerPrompt(
    'agentgate_prepare_handoff',
    {
      description: 'Prepare a structured handoff packet for another agent or a later session.',
      argsSchema: {
        runId: z.string().describe('The run to hand off'),
      },
    },
    async ({ runId }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Prepare a handoff packet for run ${runId}. Include completed steps, pending steps, touched files, constraints, risks, verification status, and the single best next action.`,
          },
        },
      ],
    }),
  )

  server.registerResource(
    'taskcard-resource',
    new ResourceTemplate('taskcard://{runId}', { list: undefined }),
    {
      title: 'TaskCard',
      description: 'Structured task state for a run.',
      mimeType: 'application/json',
    },
    async (_uri, variables) => {
      const runId = String(variables.runId ?? '')
      return {
        contents: [
          {
            uri: `taskcard://${runId}`,
            text: asJson(store.requireTaskCard(runId)),
          },
        ],
      }
    },
  )

  server.registerResource(
    'handoff-resource',
    new ResourceTemplate('handoff://{runId}', { list: undefined }),
    {
      title: 'HandoffPacket',
      description: 'Structured handoff data for a run.',
      mimeType: 'application/json',
    },
    async (_uri, variables) => {
      const runId = String(variables.runId ?? '')
      return {
        contents: [
          {
            uri: `handoff://${runId}`,
            text: asJson(store.requireHandoff(runId)),
          },
        ],
      }
    },
  )

  server.registerResource(
    'runlog-resource',
    new ResourceTemplate('runlog://{runId}', { list: undefined }),
    {
      title: 'RunLog',
      description: 'Audit and lifecycle log for a run.',
      mimeType: 'application/json',
    },
    async (_uri, variables) => {
      const runId = String(variables.runId ?? '')
      return {
        contents: [
          {
            uri: `runlog://${runId}`,
            text: asJson({
              audit: store.listAuditEvents(runId),
              events: store.listRunEvents(runId),
            }),
          },
        ],
      }
    },
  )

  server.registerResource(
    'policy-current',
    'policy://current',
    {
      title: 'Current Policy',
      description: 'Current runtime policy summary.',
      mimeType: 'application/json',
    },
    async () => ({
      contents: [
        {
          uri: 'policy://current',
          text: asJson(config.policy),
        },
      ],
    }),
  )

  return {
    server,
    store,
    orchestrator,
    config,
  }
}

export async function startStdioServer(config: AgentGateConfig = defaultConfig): Promise<AgentGateServerRuntime> {
  const runtime = createAgentGateServer(config)
  const transport = new StdioServerTransport()
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
