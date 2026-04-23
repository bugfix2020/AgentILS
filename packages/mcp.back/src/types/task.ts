import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { ControlModeSchema } from './control-mode.js'

export const taskPhases = ['collect', 'plan', 'execute', 'test', 'summarize'] as const
export const taskTerminals = ['active', 'completed', 'failed', 'abandoned'] as const
export const loopStatuses = ['continue', 'done', 'failed', 'abandoned'] as const
export const interactionKinds = ['plan_confirm', 'clarification', 'risk_confirm', 'test_confirm', 'finish_confirm'] as const
export const interactionActionIds = [
  'execute',
  'continue_input',
  'clarify',
  'accept_risk',
  'switch_to_direct',
  'cancel',
  'accept_test',
  'replan',
  'confirm_finish',
] as const
export const loopDirectives = [
  'noop',
  'draft_plan',
  'request_clarification',
  'execute',
  'execution_succeeded',
  'execution_failed',
  'tests_passed',
  'tests_failed',
  'finish',
] as const
export const loopNextActions = ['recall_tool', 'await_webview', 'return_control'] as const

export const TaskPhaseSchema = z.enum(taskPhases)
export const TaskTerminalSchema = z.enum(taskTerminals)
export const LoopStatusSchema = z.enum(loopStatuses)
export const InteractionKindSchema = z.enum(interactionKinds)
export const InteractionActionIdSchema = z.enum(interactionActionIds)
export const LoopDirectiveSchema = z.enum(loopDirectives)
export const LoopNextActionSchema = z.enum(loopNextActions)

export type TaskPhase = z.infer<typeof TaskPhaseSchema>
export type TaskTerminal = z.infer<typeof TaskTerminalSchema>
export type LoopStatus = z.infer<typeof LoopStatusSchema>
export type InteractionKind = z.infer<typeof InteractionKindSchema>
export type InteractionActionId = z.infer<typeof InteractionActionIdSchema>
export type LoopDirective = z.infer<typeof LoopDirectiveSchema>
export type LoopNextAction = z.infer<typeof LoopNextActionSchema>

export const TaskInteractionActionSchema = z.object({
  id: InteractionActionIdSchema,
  label: z.string(),
})

export type TaskInteractionAction = z.infer<typeof TaskInteractionActionSchema>

export const TaskInteractionSchema = z.object({
  interactionKey: z.string(),
  requestId: z.string(),
  kind: InteractionKindSchema,
  title: z.string(),
  description: z.string(),
  reopenCount: z.number().int().nonnegative().default(0),
  actions: z.array(TaskInteractionActionSchema).default([]),
  inputHint: z.string().optional(),
})

export type TaskInteraction = z.infer<typeof TaskInteractionSchema>

export const TaskInteractionResultSchema = z.object({
  interactionKey: z.string(),
  actionId: InteractionActionIdSchema.optional(),
  message: z.string().optional(),
  closed: z.boolean().optional(),
})

export type TaskInteractionResult = z.infer<typeof TaskInteractionResultSchema>

export const TaskTimelineEntrySchema = z.object({
  id: z.string(),
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  kind: z.enum(['text', 'tool_call', 'tool_result', 'interaction_opened', 'interaction_resolved', 'status']),
  content: z.unknown(),
  timestamp: z.string(),
})

export type TaskTimelineEntry = z.infer<typeof TaskTimelineEntrySchema>

// ────────────────────────────────────────────────────────────────────────────
// 5 节点结构化内容 + ECAM 法则历程 (PR-A)
// 真值源: docs/agentils/webview-source-of-truth-cascade-plan.md §1.2.2 / §3.1
// ────────────────────────────────────────────────────────────────────────────

export const RiskLevelSchema = z.enum(['none', 'low', 'medium', 'high'])
export type RiskLevel = z.infer<typeof RiskLevelSchema>

export const ConflictKindSchema = z.enum(['time', 'resource', 'irreversible', 'logic'])
export type ConflictKind = z.infer<typeof ConflictKindSchema>

export const PlanConflictSchema = z.object({
  kind: ConflictKindSchema,
  description: z.string(),
  involves: z.array(z.string()).default([]),
})
export type PlanConflict = z.infer<typeof PlanConflictSchema>

export const CollectStateSchema = z.object({
  assistantReply: z.string().optional(),
  recordedInput: z.string().optional(),
  clarifyingQuestions: z.array(z.string()).default([]),
  missingPoints: z.array(z.string()).default([]),
})
export type CollectState = z.infer<typeof CollectStateSchema>

export const PlanStateSchema = z.object({
  assistantReply: z.string().optional(),
  planSteps: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  missingPoints: z.array(z.string()).default([]),
  conflicts: z.array(PlanConflictSchema).default([]),
  riskLevel: RiskLevelSchema.optional(),
  confirmPrompt: z.string().optional(),
})
export type PlanState = z.infer<typeof PlanStateSchema>

export const ExecuteStateSchema = z.object({
  assistantReply: z.string().optional(),
  artifacts: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  riskLevel: RiskLevelSchema.optional(),
  confirmPrompt: z.string().optional(),
})
export type ExecuteState = z.infer<typeof ExecuteStateSchema>

export const TestStateSchema = z.object({
  assistantReply: z.string().optional(),
  testsPassed: z.number().int().nonnegative().default(0),
  testsTotal: z.number().int().nonnegative().default(0),
  uncovered: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
})
export type TestState = z.infer<typeof TestStateSchema>

export const SummarizeStateSchema = z.object({
  assistantReply: z.string().optional(),
  taskTitle: z.string().default(''),
  finalKeyPoints: z.array(z.string()).default([]),
  verifyConclusion: z.string().default(''),
})
export type SummarizeState = z.infer<typeof SummarizeStateSchema>

export const ControlModeHistoryEntrySchema = z.object({
  at: z.string(),
  from: ControlModeSchema,
  to: ControlModeSchema,
  reason: z.string(),
  triggeredBy: z.enum(['tcas', 'user_input', 'user_button', 'system']),
})
export type ControlModeHistoryEntry = z.infer<typeof ControlModeHistoryEntrySchema>

export const AgentILSTaskSchema = z.object({
  taskId: z.string(),
  sessionId: z.string(),
  title: z.string(),
  goal: z.string(),
  phase: TaskPhaseSchema,
  controlMode: ControlModeSchema.default('normal'),
  terminal: TaskTerminalSchema.default('active'),
  collectedInputs: z.array(z.string()).default([]),
  planSummary: z.string().nullable().default(null),
  risks: z.array(z.string()).default([]),
  executionResult: z.string().nullable().default(null),
  testResult: z.string().nullable().default(null),
  summary: z.string().nullable().default(null),
  pendingInteraction: TaskInteractionSchema.nullable().default(null),
  reopenCount: z.number().int().nonnegative().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),

  // PR-A 新增: 5 节点结构化 + ECAM 历程
  collectState: CollectStateSchema.nullable().default(null),
  planState: PlanStateSchema.nullable().default(null),
  executeState: ExecuteStateSchema.nullable().default(null),
  testState: TestStateSchema.nullable().default(null),
  summarizeState: SummarizeStateSchema.nullable().default(null),
  controlModeHistory: z.array(ControlModeHistoryEntrySchema).default([]),
})

export type AgentILSTask = z.infer<typeof AgentILSTaskSchema>

export const StateSnapshotSchema = z.object({
  session: z.object({
    sessionId: z.string(),
    status: z.enum(['active', 'closed']),
    activeTaskId: z.string().nullable(),
    taskIds: z.array(z.string()),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  task: AgentILSTaskSchema.nullable(),
  tasks: z.array(AgentILSTaskSchema),
  timeline: z.array(TaskTimelineEntrySchema),
})

export type StateSnapshot = z.infer<typeof StateSnapshotSchema>

export const RunTaskLoopInputSchema = z.object({
  sessionId: z.string().optional(),
  taskId: z.string().optional(),
  userIntent: z.string().optional(),
  interactionResult: TaskInteractionResultSchema.optional(),
  directive: LoopDirectiveSchema.optional(),
})

export type RunTaskLoopInput = z.infer<typeof RunTaskLoopInputSchema>

export const RunTaskLoopResultSchema = z.object({
  status: LoopStatusSchema,
  reason: z.string().optional(),
  task: z.object({
    taskId: z.string(),
    phase: TaskPhaseSchema,
    controlMode: ControlModeSchema,
    terminal: TaskTerminalSchema,
  }),
  interaction: TaskInteractionSchema.nullable().default(null),
  output: z.object({
    summary: z.string(),
    userVisibleMessage: z.string().optional(),
  }),
  next: z.object({
    action: LoopNextActionSchema.describe(
      'The orchestrator-selected next step. recall_tool means the caller must immediately call run_task_loop again. await_webview means keep the tool flow open and wait for WebView/user input. return_control means the loop reached a terminal state and may return control to Copilot.',
    ),
    shouldRecallTool: z.boolean(),
    recallMode: z.enum(['immediate']).optional(),
    canRenderWebview: z.boolean(),
  }),
  snapshot: StateSnapshotSchema,
})

export type RunTaskLoopResult = z.infer<typeof RunTaskLoopResultSchema>

export function createTask(params: {
  sessionId: string
  userIntent: string
  controlMode?: z.infer<typeof ControlModeSchema>
  now?: string
}): AgentILSTask {
  const now = params.now ?? new Date().toISOString()
  const normalized = params.userIntent.trim() || 'New task'
  const singleLine = normalized.replace(/\s+/g, ' ')
  const title = singleLine.slice(0, 60)

  return AgentILSTaskSchema.parse({
    taskId: `task_${randomUUID()}`,
    sessionId: params.sessionId,
    title,
    goal: singleLine,
    phase: 'collect',
    controlMode: params.controlMode ?? 'normal',
    terminal: 'active',
    collectedInputs: [normalized],
    createdAt: now,
    updatedAt: now,
  })
}
