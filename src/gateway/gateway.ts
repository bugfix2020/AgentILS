import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { pathToFileURL } from 'node:url'
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

export function createAgentGateServer(config: AgentGateConfig = defaultConfig): AgentGateServerRuntime {
  const store = new AgentGateMemoryStore()
  const orchestrator = new AgentGateOrchestrator(store)
  const server = new McpServer({
    name: config.serverName,
    version: config.serverVersion,
  })

  server.registerTool(
    'run_start',
    {
      description: 'Start a new Agent Gate run with an explicit task goal and execution envelope.',
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
      },
    },
    async ({ runId, summary, riskLevel }) => {
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
        return textResult('Approval result', fallback)
      }

      const result = ApprovalResultSchema.parse({
        action: elicited.content.action,
        payload: {
          status: elicited.content.status,
          msg: elicited.content.msg ?? '',
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
      description: 'Start a disciplined Agent Gate run from the current context.',
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
            text: `Start a new Agent Gate run for the following goal: ${goal}. First classify the mode, then collect only the minimum blocking details, then persist taskCard state.`,
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

export async function startIfEntrypoint(): Promise<void> {
  const entryArg = process.argv[1]
  if (!entryArg) {
    return
  }

  if (import.meta.url === pathToFileURL(entryArg).href) {
    await startStdioServer()
  }
}
