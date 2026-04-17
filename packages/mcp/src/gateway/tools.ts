import { z } from 'zod'
import { ApprovalResultSchema, FeedbackDecisionSchema, HandoffPacketSchema, TaskCardSchema } from '../types/index.js'
import { createAgentGateRequestContext, type AgentGateRequestContext, type AgentGateServerRuntime } from './context.js'
import { buildActiveTaskSnapshot, readGatewayRunSnapshot, resolveRun, resolveRunId, textResult } from './shared.js'

const taskReadinessSchema = z.object({
  technicallyReady: z.boolean().optional(),
  boundaryApproved: z.boolean().optional(),
  policyAllowed: z.boolean().optional(),
  missingInfo: z.array(z.string()).optional(),
  risks: z.array(z.string()).optional(),
})

const taskStartSchema = z.object({
  title: z.string().min(1),
  goal: z.string().min(1),
  scope: z.array(z.string()).optional(),
  constraints: z.array(z.string()).optional(),
  risks: z.array(z.string()).optional(),
  verificationRequirements: z.array(z.string()).optional(),
  conversationId: z.string().nullable().optional(),
  mode: z.enum(['casual', 'discussion', 'analysis_only', 'execution_intent', 'handoff_intent', 'verify_intent']).optional(),
  controlMode: z.enum(['normal', 'alternate', 'direct']).optional(),
  summaryDocumentPath: z.string().nullable().optional(),
  openQuestions: z.array(z.string()).optional(),
  assumptions: z.array(z.string()).optional(),
  decisionNeededFromUser: z.array(z.string()).optional(),
  executionReadiness: taskReadinessSchema.optional(),
})

function buildTaskStartInput(input: z.infer<typeof taskStartSchema>) {
  return {
    title: input.title,
    goal: input.goal,
    scope: input.scope ?? [],
    constraints: input.constraints ?? [],
    risks: input.risks ?? [],
    verificationRequirements: input.verificationRequirements ?? [],
    conversationId: input.conversationId ?? null,
    mode: input.mode,
    controlMode: input.controlMode,
    summaryDocumentPath: input.summaryDocumentPath ?? null,
    openQuestions: input.openQuestions ?? [],
    assumptions: input.assumptions ?? [],
    decisionNeededFromUser: input.decisionNeededFromUser ?? [],
    executionReadiness: input.executionReadiness,
  }
}

function createToolRequestContext(runtime: AgentGateServerRuntime, preferredRunId?: string | null): AgentGateRequestContext {
  const resolved = resolveRun(runtime.store, preferredRunId)

  return createAgentGateRequestContext(runtime, {
    runId: resolved?.runId ?? preferredRunId ?? undefined,
    conversationId: resolved?.run.conversationId ?? undefined,
    taskId: resolved?.run.taskId ?? undefined,
  })
}

function registerTaskLifecycleTools(runtime: AgentGateServerRuntime) {
  const { server, store, orchestrator } = runtime

  server.registerTool(
    'new_task_request',
    {
      description: 'Start a new AgentILS task in the current conversation and return the task, summary, and conversation state.',
      inputSchema: taskStartSchema,
    },
    async (input) => {
      const run = orchestrator.startRun(buildTaskStartInput(input))
      return textResult('New task requested', {
        run,
        conversation: store.getConversationRecord(run.runId),
        taskRecord: store.getTaskRecord(run.runId, run.summaryDocumentPath),
        taskSummary: store.getTaskSummary(run.runId),
        summaryDocument: store.readTaskSummary(run.taskId),
        controlMode: run.controlMode,
      })
    },
  )

  server.registerTool(
    'run_get',
    {
      description: 'Compatibility read alias for the current run state. Prefer the run-snapshot:// resource family for new clients.',
      inputSchema: {
        runId: z.string().optional(),
      },
    },
    async ({ runId }) => {
      const resolvedRunId = resolveRunId(store, runId)
      if (!resolvedRunId) {
        return textResult('Run state', { error: 'No run has been started yet.' }, true)
      }
      return textResult('Run state', store.requireRun(resolvedRunId))
    },
  )

  server.registerTool(
    'run_start',
    {
      description: 'Compatibility alias for starting a new AgentILS task.',
      inputSchema: taskStartSchema,
    },
    async (input) => {
      const run = orchestrator.startRun(buildTaskStartInput(input))
      return textResult('Run started', {
        run,
        conversation: store.getConversationRecord(run.runId),
        taskRecord: store.getTaskRecord(run.runId, run.summaryDocumentPath),
        taskSummary: store.getTaskSummary(run.runId),
        summaryDocument: store.readTaskSummary(run.taskId),
        controlMode: run.controlMode,
      })
    },
  )

  server.registerTool(
    'conversation_get',
    {
      description: 'Compatibility read alias for conversation state. Prefer run-snapshot://current or conversation://current resources for new clients.',
      inputSchema: {
        runId: z.string().optional(),
      },
    },
    async ({ runId }) => {
      const snapshot = readGatewayRunSnapshot(runtime.store, runId)
      return textResult('Conversation state', {
        conversation: store.getConversationRecord(runId),
        resolvedRunId: snapshot?.runId ?? resolveRunId(store, runId),
        activeTask: buildActiveTaskSnapshot(snapshot),
        taskRecord: snapshot?.taskRecord ?? null,
        taskSummary: snapshot?.taskSummary ?? null,
        summaryDocument: snapshot?.summaryDocument ?? null,
        nextAction: snapshot?.nextAction ?? 'await_next_task',
      })
    },
  )

  server.registerTool(
    'conversation_end',
    {
      description: 'Explicitly end the current conversation after all tasks are complete.',
      inputSchema: {
        runId: z.string().optional(),
      },
    },
    async ({ runId }) =>
      textResult('Conversation ended', {
        conversation: orchestrator.endConversation(runId),
      }),
  )

  server.registerTool(
    'control_mode_get',
    {
      description: 'Compatibility read alias for control mode state. Prefer control-mode://{runId} or run-snapshot:// resources for new clients.',
      inputSchema: {
        runId: z.string().optional(),
      },
    },
    async ({ runId }) => {
      const snapshot = readGatewayRunSnapshot(runtime.store, runId)
      if (!snapshot) {
        return textResult('Control mode', { error: 'No run has been started yet.' }, true)
      }

      return textResult('Control mode', {
        runId: snapshot.runId,
        taskId: snapshot.taskId,
        controlMode: snapshot.run.controlMode,
        isOverrideActive: Boolean(snapshot.overrideState?.confirmed),
        overrideState: snapshot.overrideState,
        taskRecord: snapshot.taskRecord,
        nextAction: snapshot.nextAction,
      })
    },
  )

  server.registerTool(
    'task_summary_get',
    {
      description: 'Compatibility read alias for task summary data. Prefer task-summary://{runId} or run-snapshot:// resources for new clients.',
      inputSchema: {
        runId: z.string().optional(),
        taskId: z.string().optional(),
      },
    },
    async ({ runId, taskId }) => {
      const snapshot = readGatewayRunSnapshot(runtime.store, runId)
      const resolvedTaskId = taskId ?? snapshot?.taskId ?? null

      if (!resolvedTaskId) {
        return textResult('Task summary', { error: 'No taskId or runId was provided, and no active run exists.' }, true)
      }

      const summaryDocument = store.readTaskSummary(resolvedTaskId)

      return textResult('Task summary', {
        taskId: resolvedTaskId,
        runId: snapshot?.runId ?? resolveRunId(store, runId),
        taskSummary: snapshot?.taskSummary ?? (snapshot ? store.getTaskSummary(snapshot.runId) : null),
        summaryDocument,
        summaryAvailable: Boolean(summaryDocument),
        summaryPath: snapshot?.run.summaryDocumentPath ?? null,
      })
    },
  )

  server.registerTool(
    'taskcard_get',
    {
      description: 'Compatibility read alias for taskCard state. Prefer taskcard://{runId} or run-snapshot:// resources for new clients.',
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
      description: 'Compatibility read alias for handoff state. Prefer handoff://{runId} or run-snapshot:// resources for new clients.',
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
      textResult('Policy check', orchestrator.evaluatePolicy(runId, toolName, targets ?? [], runtime.config.policy)),
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
    async ({ runId, userConfirmedDone }) => {
      const ctx = createToolRequestContext(runtime, runId)
      return textResult('Verify run', orchestrator.verifyRun(runId, userConfirmedDone, ctx))
    },
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
      const ctx = createToolRequestContext(runtime, runId)

      orchestrator.beginApprovalRequest(ctx, {
        runId,
        summary,
        riskLevel,
        toolName,
        targets: targets ?? [],
      })

      const elicited = await ctx.elicitUser({
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
        orchestrator.recordApproval(runId, summary, fallback as never, ctx)
        return textResult('Approval result', fallback)
      }

      const result = ApprovalResultSchema.parse({
        action: elicited.content.action,
        payload: {
          status: elicited.content.status,
          msg: elicited.content.msg ?? '',
        },
      })

      orchestrator.recordApproval(runId, summary, result, ctx)
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
      const ctx = createToolRequestContext(runtime, runId)
      const elicited = await ctx.elicitUser({
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
      orchestrator.recordFeedback(runId, decision, ctx)
      return textResult('Feedback result', decision)
    },
  )
}

export function registerGatewayTools(runtime: AgentGateServerRuntime): void {
  registerTaskLifecycleTools(runtime)
}
