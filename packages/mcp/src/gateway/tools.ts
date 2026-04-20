import { z } from 'zod'
import {
  ApprovalResultSchema,
  FeedbackDecisionSchema,
  HandoffPacketSchema,
  TaskCardSchema,
  createAgentILSSessionMessage,
} from '../types/index.js'
import {
  acceptUiOverride,
  beginUiApproval,
  buildUiActionServices,
  buildUiRuntimeSnapshot,
  continueUiTask,
  finishUiConversation,
  markUiTaskDone,
  recordUiApproval,
  recordUiFeedback,
  startUiTask,
} from '../control-plane/ui-actions.js'
import { createAgentGateRequestContext, type AgentGateRequestContext, type AgentGateServerRuntime } from './context.js'
import { buildActiveTaskSnapshot, readGatewayRunSnapshot, resolveRun, resolveRunId, textResult } from './shared.js'
import { JsonlLogger } from '../logger.js'

const taskReadinessSchema = z.object({
  technicallyReady: z.boolean().optional(),
  boundaryApproved: z.boolean().optional(),
  policyAllowed: z.boolean().optional(),
  missingInfo: z.array(z.string()).optional(),
  risks: z.array(z.string()).optional(),
})

const uiTaskStartGateSchema = z.object({
  title: z.string().optional(),
  goal: z.string().optional(),
  controlMode: z.enum(['normal', 'alternate', 'direct']).optional(),
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

function resolveOrCreateSession(runtime: AgentGateServerRuntime, preferredRunId?: string | null, preferredSessionId?: string | null) {
  const existing = runtime.store.getCurrentSession(preferredRunId, preferredSessionId)
  if (existing) {
    JsonlLogger.debug('mcp', 'resolveOrCreateSession', 'using_existing_session', { sessionId: existing.sessionId })
    return existing
  }

  const run = preferredRunId ? runtime.store.getRun(preferredRunId) : null
  const session = runtime.store.createSession({
    conversationId: run?.conversationId ?? 'conversation_default',
    runId: run?.runId ?? null,
  })
  JsonlLogger.info('mcp', 'resolveOrCreateSession', 'session_created', { sessionId: session.sessionId, runId: run?.runId ?? null })
  return session
}

function registerTaskLifecycleTools(runtime: AgentGateServerRuntime) {
  const { server, store, orchestrator } = runtime
  const uiServices = buildUiActionServices(store, orchestrator)

  server.registerTool(
    'new_task_request',
    {
      description: 'Start a new AgentILS task in the current conversation and return the task, summary, and conversation state.',
      inputSchema: taskStartSchema,
    },
    async (input) => {
      JsonlLogger.info('mcp', 'new_task_request', 'tool_called', { title: input.title, goal: input.goal })
      const run = orchestrator.startRun(buildTaskStartInput(input))
      JsonlLogger.info('mcp', 'new_task_request', 'run_started', { runId: run.runId, taskId: run.taskId })
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
      JsonlLogger.info('mcp', 'approval_request', 'tool_called', { runId, riskLevel, summary: summary.substring(0, 100) })
      const ctx = createToolRequestContext(runtime, runId)
      const session = resolveOrCreateSession(runtime, runId)

      orchestrator.beginApprovalRequest(ctx, {
        runId,
        summary,
        riskLevel,
        toolName,
        targets: targets ?? [],
      })
      JsonlLogger.info('mcp', 'approval_request', 'interaction_opened', { sessionId: session.sessionId, runId })
      runtime.store.openSessionInteraction(session.sessionId, {
        requestId: `approval_${Date.now()}`,
        kind: 'approval',
        runId,
        title: 'Approval Required',
        description: summary,
        required: false,
        options: [],
        summary,
        riskLevel,
        targets: targets ?? [],
        risks: [],
      })
      runtime.store.appendSessionMessage(
        session.sessionId,
        createAgentILSSessionMessage({
          role: 'system',
          kind: 'interaction_opened',
          content: {
            interactionKind: 'approval',
            summary,
            riskLevel,
          },
        }),
      )

      const elicited = await ctx.elicitUser({
        mode: 'form',
        message: `Approval required (${riskLevel} risk): ${summary}`,
        _meta: {
          agentilsInteractionKind: 'approval',
          agentilsSessionId: session.sessionId,
        },
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
        runtime.store.appendSessionMessage(
          session.sessionId,
          createAgentILSSessionMessage({
            role: 'system',
            kind: 'interaction_resolved',
            content: {
              interactionKind: 'approval',
              action: elicited.action,
            },
          }),
        )
        runtime.store.clearSessionInteraction(session.sessionId)
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
      runtime.store.appendSessionMessage(
        session.sessionId,
        createAgentILSSessionMessage({
          role: 'system',
          kind: 'interaction_resolved',
          content: {
            interactionKind: 'approval',
            action: result.action,
            payload: result.payload,
          },
        }),
      )
      runtime.store.clearSessionInteraction(session.sessionId)
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
      JsonlLogger.info('mcp', 'feedback_gate', 'tool_called', { runId, summary: summary.substring(0, 100) })
      const ctx = createToolRequestContext(runtime, runId)
      const session = resolveOrCreateSession(runtime, runId)
      JsonlLogger.info('mcp', 'feedback_gate', 'interaction_opened', { sessionId: session.sessionId, runId })
      runtime.store.openSessionInteraction(session.sessionId, {
        requestId: `feedback_${Date.now()}`,
        kind: 'feedback',
        runId,
        title: 'Feedback Required',
        description: summary,
        required: false,
        options: [],
        summary,
        targets: [],
        risks: [],
      })
      runtime.store.appendSessionMessage(
        session.sessionId,
        createAgentILSSessionMessage({
          role: 'system',
          kind: 'interaction_opened',
          content: {
            interactionKind: 'feedback',
            summary,
          },
        }),
      )
      const elicited = await ctx.elicitUser({
        mode: 'form',
        message: `Feedback gate: ${summary}`,
        _meta: {
          agentilsInteractionKind: 'feedback',
          agentilsSessionId: session.sessionId,
        },
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
        runtime.store.appendSessionMessage(
          session.sessionId,
          createAgentILSSessionMessage({
            role: 'system',
            kind: 'interaction_resolved',
            content: {
              interactionKind: 'feedback',
              action: elicited.action,
            },
          }),
        )
        runtime.store.clearSessionInteraction(session.sessionId)
        return textResult('Feedback result', { action: elicited.action })
      }

      const decision = FeedbackDecisionSchema.parse({
        status: elicited.content.status,
        msg: elicited.content.msg ?? '',
      })
      orchestrator.recordFeedback(runId, decision, ctx)
      runtime.store.appendSessionMessage(
        session.sessionId,
        createAgentILSSessionMessage({
          role: 'system',
          kind: 'interaction_resolved',
          content: {
            interactionKind: 'feedback',
            status: decision.status,
            msg: decision.msg,
          },
        }),
      )
      runtime.store.clearSessionInteraction(session.sessionId)
      return textResult('Feedback result', decision)
    },
  )

  server.registerTool(
    'clarification_request',
    {
      description: 'Collect blocking clarification using MCP elicitation and record it in the active AgentILS session.',
      inputSchema: {
        runId: z.string().optional(),
        sessionId: z.string().optional(),
        question: z.string().min(1),
        context: z.string().optional(),
        placeholder: z.string().optional(),
        required: z.boolean().optional(),
      },
    },
    async ({ runId, sessionId, question, context, placeholder, required }) => {
      JsonlLogger.info('mcp', 'clarification_request', 'tool_called', { runId, question: question.substring(0, 100), sessionId })
      const ctx = createToolRequestContext(runtime, runId)
      const session = resolveOrCreateSession(runtime, runId, sessionId)
      JsonlLogger.info('mcp', 'clarification_request', 'interaction_opened', { sessionId: session.sessionId, runId: runId ?? session.runId })
      runtime.store.openSessionInteraction(session.sessionId, {
        requestId: `clarification_${Date.now()}`,
        kind: 'clarification',
        runId: runId ?? session.runId,
        title: 'Clarification Required',
        description: [question, context].filter(Boolean).join('\n\n'),
        placeholder,
        required: required ?? true,
        options: [],
        targets: [],
        risks: [],
      })
      runtime.store.appendSessionMessage(
        session.sessionId,
        createAgentILSSessionMessage({
          role: 'system',
          kind: 'interaction_opened',
          content: {
            interactionKind: 'clarification',
            question,
            context: context ?? '',
          },
        }),
      )

      const elicited = await ctx.elicitUser({
        mode: 'form',
        message: question,
        _meta: {
          agentilsInteractionKind: 'clarification',
          agentilsSessionId: session.sessionId,
        },
        requestedSchema: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              title: 'Response',
              description: context ?? placeholder ?? 'Provide the missing detail.',
            },
          },
          required: required ?? true ? ['content'] : [],
        },
      })

      if (elicited.action !== 'accept' || !elicited.content) {
        runtime.store.appendSessionMessage(
          session.sessionId,
          createAgentILSSessionMessage({
            role: 'system',
            kind: 'interaction_resolved',
            content: {
              interactionKind: 'clarification',
              action: elicited.action,
            },
          }),
        )
        runtime.store.clearSessionInteraction(session.sessionId)
        return textResult('Clarification result', {
          action: elicited.action,
        })
      }

      runtime.store.appendSessionMessage(
        session.sessionId,
        createAgentILSSessionMessage({
          role: 'user',
          kind: 'text',
          content: String(elicited.content.content ?? ''),
        }),
        true,
      )
      runtime.store.appendSessionMessage(
        session.sessionId,
        createAgentILSSessionMessage({
          role: 'system',
          kind: 'interaction_resolved',
          content: {
            interactionKind: 'clarification',
            action: 'accept',
          },
        }),
      )
      runtime.store.clearSessionInteraction(session.sessionId)
      return textResult('Clarification result', {
        action: 'accept',
        content: String(elicited.content.content ?? ''),
        sessionId: session.sessionId,
      })
    },
  )

  server.registerTool(
    'ui_runtime_snapshot_get',
    {
      description: 'Read the AgentILS UI runtime snapshot through the MCP gateway.',
      inputSchema: {
        preferredRunId: z.string().optional(),
      },
    },
    async ({ preferredRunId }) =>
      textResult(
        'UI runtime snapshot',
        buildUiRuntimeSnapshot(
          {
            preferredRunId,
          },
          uiServices,
        ),
      ),
  )

  server.registerTool(
    'ui_session_get',
    {
      description: 'Read the current AgentILS session transcript and pending interaction state.',
      inputSchema: {
        preferredRunId: z.string().optional(),
        sessionId: z.string().optional(),
      },
    },
    async ({ preferredRunId, sessionId }) =>
      textResult('UI session', runtime.store.getCurrentSession(preferredRunId, sessionId)),
  )

  server.registerTool(
    'ui_session_append_user_message',
    {
      description: 'Append a user message into the current AgentILS session and queue it for the VS Code enhanced runner.',
      inputSchema: {
        content: z.string().min(1),
        preferredRunId: z.string().optional(),
        sessionId: z.string().optional(),
      },
    },
    async ({ content, preferredRunId, sessionId }) => {
      const session = resolveOrCreateSession(runtime, preferredRunId, sessionId)
      runtime.store.appendSessionMessage(
        session.sessionId,
        createAgentILSSessionMessage({
          role: 'user',
          kind: 'text',
          content,
        }),
        true,
      )
      return textResult(
        'UI session message appended',
        buildUiRuntimeSnapshot(
          {
            preferredRunId: preferredRunId ?? session.runId ?? undefined,
          },
          uiServices,
        ),
      )
    },
  )

  server.registerTool(
    'ui_session_append_assistant_message',
    {
      description: 'Append or update an assistant message in the current AgentILS session transcript.',
      inputSchema: {
        messageId: z.string().optional(),
        content: z.string(),
        state: z.enum(['streaming', 'final']).default('final'),
        preferredRunId: z.string().optional(),
        sessionId: z.string().optional(),
      },
    },
    async ({ messageId, content, state, preferredRunId, sessionId }) => {
      const session = resolveOrCreateSession(runtime, preferredRunId, sessionId)
      if (messageId && session.messages.some((message) => message.id === messageId)) {
        runtime.store.updateSessionMessage(session.sessionId, messageId, {
          content,
          state,
          timestamp: new Date().toISOString(),
        })
      } else {
        runtime.store.appendSessionMessage(
          session.sessionId,
          createAgentILSSessionMessage({
            id: messageId,
            role: 'assistant',
            kind: 'text',
            content,
            state,
          }),
        )
      }

      return textResult(
        'UI assistant message appended',
        buildUiRuntimeSnapshot(
          {
            preferredRunId: preferredRunId ?? session.runId ?? undefined,
          },
          uiServices,
        ),
      )
    },
  )

  server.registerTool(
    'ui_session_append_tool_event',
    {
      description: 'Append a tool call or tool result event into the current AgentILS session transcript.',
      inputSchema: {
        kind: z.enum(['tool_call', 'tool_result', 'status']),
        content: z.unknown(),
        preferredRunId: z.string().optional(),
        sessionId: z.string().optional(),
      },
    },
    async ({ kind, content, preferredRunId, sessionId }) => {
      const session = resolveOrCreateSession(runtime, preferredRunId, sessionId)
      runtime.store.appendSessionMessage(
        session.sessionId,
        createAgentILSSessionMessage({
          role: kind === 'status' ? 'system' : 'tool',
          kind,
          content,
        }),
      )
      return textResult(
        'UI tool event appended',
        buildUiRuntimeSnapshot(
          {
            preferredRunId: preferredRunId ?? session.runId ?? undefined,
          },
          uiServices,
        ),
      )
    },
  )

  server.registerTool(
    'ui_session_consume_user_message',
    {
      description: 'Mark a queued AgentILS session user message as consumed by the enhanced runner.',
      inputSchema: {
        messageId: z.string().min(1),
        preferredRunId: z.string().optional(),
        sessionId: z.string().optional(),
      },
    },
    async ({ messageId, preferredRunId, sessionId }) => {
      const session = resolveOrCreateSession(runtime, preferredRunId, sessionId)
      runtime.store.consumeSessionUserMessage(session.sessionId, messageId)
      return textResult(
        'UI session user message consumed',
        buildUiRuntimeSnapshot(
          {
            preferredRunId: preferredRunId ?? session.runId ?? undefined,
          },
          uiServices,
        ),
      )
    },
  )

  server.registerTool(
    'ui_session_finish',
    {
      description: 'Finish the current AgentILS session and attempt to end the associated conversation.',
      inputSchema: {
        preferredRunId: z.string().optional(),
        sessionId: z.string().optional(),
      },
    },
    async ({ preferredRunId, sessionId }) => {
      const session = resolveOrCreateSession(runtime, preferredRunId, sessionId)
      runtime.store.finishSession(session.sessionId)
      const finishResult = finishUiConversation(
        {
          preferredRunId: preferredRunId ?? session.runId ?? undefined,
        },
        uiServices,
      )
      return textResult('UI session finished', finishResult)
    },
  )

  server.registerTool(
    'ui_task_start_gate',
    {
      description:
        'Collect or confirm the initial AgentILS task input through MCP elicitation, then start the task and return the updated runtime snapshot.',
      inputSchema: uiTaskStartGateSchema,
    },
    async ({ title, goal, controlMode }) => {
      const ctx = createToolRequestContext(runtime)
      const session = resolveOrCreateSession(runtime)

      // 【Bug A 修复】如果已提供完整的任务信息，直接启动，不需要弹出 pending interaction
      const hasCompleteInput = title && title.trim() && goal && goal.trim()
      
      if (hasCompleteInput) {
        // 直接使用提供的参数启动任务
        JsonlLogger.info('mcp', 'ui_task_start_gate', 'starting_with_provided_params', { title, goal, hasInteraction: false })
        const parsed = taskStartSchema.parse({
          title: title.trim(),
          goal: goal.trim(),
          controlMode: controlMode ?? 'normal',
        })
        const snapshot = startUiTask(buildTaskStartInput(parsed), uiServices)
        const runId = snapshot.activeTask?.runId
        if (runId) {
          runtime.store.bindSessionToRun(session.sessionId, runId)
        }
        return textResult('UI task started', buildUiRuntimeSnapshot({ preferredRunId: runId ?? undefined }, uiServices))
      }

      // 【原有逻辑】如果缺少信息，打开 pending interaction 让用户填写
      JsonlLogger.info('mcp', 'ui_task_start_gate', 'opening_interaction', { title, goal, hasInteraction: true })
      runtime.store.openSessionInteraction(session.sessionId, {
        requestId: `start_task_${Date.now()}`,
        kind: 'startTask',
        runId: null,
        title: 'Start AgentILS Task',
        description: 'Confirm or refine the initial AgentILS task before starting it.',
        required: true,
        options: [],
        targets: [],
        risks: [],
        draftTitle: title ?? '',
        draftGoal: goal ?? '',
        draftControlMode: controlMode ?? 'normal',
        controlMode: controlMode ?? 'normal',
      })
      runtime.store.appendSessionMessage(
        session.sessionId,
        createAgentILSSessionMessage({
          role: 'system',
          kind: 'interaction_opened',
          content: {
            interactionKind: 'startTask',
            title: title ?? '',
            goal: goal ?? '',
            controlMode: controlMode ?? 'normal',
          },
        }),
      )
      const elicited = await ctx.elicitUser({
        mode: 'form',
        message: 'Confirm or refine the initial AgentILS task before starting it.',
        _meta: {
          agentilsInteractionKind: 'startTask',
          agentilsSessionId: session.sessionId,
        },
        title: title ?? '',
        goal: goal ?? '',
        controlMode: controlMode ?? 'normal',
        requestedSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              title: 'Task title',
            },
            goal: {
              type: 'string',
              title: 'Task goal',
            },
            controlMode: {
              type: 'string',
              title: 'Control mode',
              oneOf: [
                { const: 'normal', title: 'normal' },
                { const: 'alternate', title: 'alternate' },
                { const: 'direct', title: 'direct' },
              ],
              default: controlMode ?? 'normal',
            },
          },
          required: ['title', 'goal'],
        },
      })

      if (elicited.action !== 'accept' || !elicited.content) {
        runtime.store.appendSessionMessage(
          session.sessionId,
          createAgentILSSessionMessage({
            role: 'system',
            kind: 'interaction_resolved',
            content: {
              interactionKind: 'startTask',
              action: elicited.action,
            },
          }),
        )
        runtime.store.clearSessionInteraction(session.sessionId)
        return textResult(
          'UI task start cancelled',
          buildUiRuntimeSnapshot(
            {
              preferredRunId: undefined,
            },
            uiServices,
          ),
        )
      }

      const parsed = taskStartSchema.parse({
        title: elicited.content.title,
        goal: elicited.content.goal,
        controlMode: elicited.content.controlMode ?? 'normal',
      })
      runtime.store.clearSessionInteraction(session.sessionId)
      runtime.store.appendSessionMessage(
        session.sessionId,
        createAgentILSSessionMessage({
          role: 'system',
          kind: 'interaction_resolved',
          content: {
            interactionKind: 'startTask',
            action: 'accept',
          },
        }),
      )

      const snapshot = startUiTask(buildTaskStartInput(parsed), uiServices)
      const runId = snapshot.activeTask?.runId
      if (runId) {
        runtime.store.bindSessionToRun(session.sessionId, runId)
      }
      return textResult('UI task started', buildUiRuntimeSnapshot({ preferredRunId: runId ?? undefined }, uiServices))
    },
  )

  server.registerTool(
    'ui_task_start',
    {
      description: 'Start a task through the AgentILS UI-facing MCP entrypoint and return the updated runtime snapshot.',
      inputSchema: taskStartSchema,
    },
    async (input) =>
      textResult('UI task started', startUiTask(buildTaskStartInput(input), uiServices)),
  )

  server.registerTool(
    'ui_task_continue',
    {
      description: 'Advance the active AgentILS task through the UI-facing MCP entrypoint.',
      inputSchema: {
        note: z.string().optional(),
        preferredRunId: z.string().optional(),
      },
    },
    async ({ note, preferredRunId }) =>
      textResult(
        'UI task continued',
        continueUiTask(
          {
            note,
            preferredRunId,
          },
          uiServices,
        ),
      ),
  )

  server.registerTool(
    'ui_override_accept',
    {
      description: 'Record an override acknowledgement through the AgentILS UI-facing MCP entrypoint.',
      inputSchema: {
        acknowledgement: z.string().min(1),
        level: z.enum(['soft', 'hard']).optional(),
        preferredRunId: z.string().optional(),
      },
    },
    async ({ acknowledgement, level, preferredRunId }) =>
      textResult(
        'UI override accepted',
        acceptUiOverride(
          {
            acknowledgement,
            level,
            preferredRunId,
          },
          uiServices,
        ),
      ),
  )

  server.registerTool(
    'ui_approval_begin',
    {
      description: 'Move the current AgentILS task into awaiting approval through the UI-facing MCP entrypoint.',
      inputSchema: {
        summary: z.string().min(1),
        riskLevel: z.enum(['low', 'medium', 'high']),
        toolName: z.string().optional(),
        targets: z.array(z.string()).optional(),
        preferredRunId: z.string().optional(),
      },
    },
    async ({ summary, riskLevel, toolName, targets, preferredRunId }) =>
      textResult(
        'UI approval begun',
        beginUiApproval(
          {
            summary,
            riskLevel,
            toolName,
            targets,
            preferredRunId,
          },
          uiServices,
        ),
      ),
  )

  server.registerTool(
    'ui_approval_record',
    {
      description: 'Record an approval decision through the AgentILS UI-facing MCP entrypoint.',
      inputSchema: {
        summary: z.string().min(1),
        action: z.enum(['accept', 'decline', 'cancel']),
        status: z.enum(['continue', 'done', 'revise']).optional(),
        message: z.string().optional(),
        preferredRunId: z.string().optional(),
      },
    },
    async ({ summary, action, status, message, preferredRunId }) =>
      textResult(
        'UI approval recorded',
        recordUiApproval(
          {
            summary,
            action,
            status,
            message,
            preferredRunId,
          },
          uiServices,
        ),
      ),
  )

  server.registerTool(
    'ui_feedback_record',
    {
      description: 'Record a feedback decision through the AgentILS UI-facing MCP entrypoint.',
      inputSchema: {
        status: z.enum(['continue', 'done', 'revise']),
        message: z.string().optional(),
        preferredRunId: z.string().optional(),
      },
    },
    async ({ status, message, preferredRunId }) =>
      textResult(
        'UI feedback recorded',
        recordUiFeedback(
          {
            status,
            message,
            preferredRunId,
          },
          uiServices,
        ),
      ),
  )

  server.registerTool(
    'ui_task_done',
    {
      description: 'Mark the active AgentILS task done through the UI-facing MCP entrypoint.',
      inputSchema: {
        summary: z.string().optional(),
        preferredRunId: z.string().optional(),
      },
    },
    async ({ summary, preferredRunId }) =>
      textResult(
        'UI task done',
        markUiTaskDone(
          {
            summary,
            preferredRunId,
          },
          uiServices,
        ),
      ),
  )

  server.registerTool(
    'ui_conversation_finish',
    {
      description: 'Attempt to finish the current conversation through the AgentILS UI-facing MCP entrypoint.',
      inputSchema: {
        preferredRunId: z.string().optional(),
      },
    },
    async ({ preferredRunId }) =>
      textResult(
        'UI conversation finish',
        finishUiConversation(
          {
            preferredRunId,
          },
          uiServices,
        ),
      ),
  )
}

export function registerGatewayTools(runtime: AgentGateServerRuntime): void {
  registerTaskLifecycleTools(runtime)
}
