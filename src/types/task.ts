import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { ControlModeSchema, OverrideStateSchema, type ControlMode, type OverrideState } from './control-mode.js'

export const conversationModes = [
  'casual',
  'discussion',
  'analysis_only',
  'execution_intent',
  'handoff_intent',
  'verify_intent',
] as const

export const runSteps = [
  'collect',
  'confirm_elements',
  'plan',
  'approval',
  'execute',
  'handoff_prepare',
  'verify',
  'done',
  'blocked',
  'cancelled',
  'failed',
] as const

export const runStatuses = [
  'active',
  'awaiting_user',
  'awaiting_approval',
  'budget_exceeded',
  'completed',
  'cancelled',
  'failed',
] as const

export const verifyVerdicts = ['pass', 'pass_with_risks', 'blocked', 'failed'] as const
export const riskLevels = ['low', 'medium', 'high'] as const
export const userActions = ['accept', 'cancel', 'decline'] as const
export const feedbackStatuses = ['continue', 'done', 'revise'] as const

export const ConversationModeSchema = z.enum(conversationModes)
export const RunStepSchema = z.enum(runSteps)
export const RunStatusSchema = z.enum(runStatuses)
export const VerifyVerdictSchema = z.enum(verifyVerdicts)
export const RiskLevelSchema = z.enum(riskLevels)
export const UserActionSchema = z.enum(userActions)
export const FeedbackStatusSchema = z.enum(feedbackStatuses)

export type ConversationMode = z.infer<typeof ConversationModeSchema>
export type RunStep = z.infer<typeof RunStepSchema>
export type RunStatus = z.infer<typeof RunStatusSchema>
export type VerifyVerdict = z.infer<typeof VerifyVerdictSchema>
export type RiskLevel = z.infer<typeof RiskLevelSchema>
export type UserAction = z.infer<typeof UserActionSchema>
export type FeedbackStatus = z.infer<typeof FeedbackStatusSchema>

export const TaskExecutionReadinessSchema = z.object({
  technicallyReady: z.boolean(),
  boundaryApproved: z.boolean(),
  policyAllowed: z.boolean(),
  missingInfo: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
})

export type TaskExecutionReadiness = z.infer<typeof TaskExecutionReadinessSchema>

const defaultTaskExecutionReadiness: TaskExecutionReadiness = {
  technicallyReady: false,
  boundaryApproved: false,
  policyAllowed: false,
  missingInfo: [],
  risks: [],
}

export const TaskStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(['todo', 'doing', 'done', 'blocked']),
  note: z.string().optional(),
})

export type TaskStep = z.infer<typeof TaskStepSchema>

export const RunBudgetSchema = z.object({
  maxLlmSteps: z.number().int().nonnegative(),
  maxToolCalls: z.number().int().nonnegative(),
  maxUserResumes: z.number().int().nonnegative(),
  maxWallClockMs: z.number().int().nonnegative(),
  maxTokens: z.number().int().nonnegative(),
  llmStepsUsed: z.number().int().nonnegative(),
  toolCallsUsed: z.number().int().nonnegative(),
  userResumesUsed: z.number().int().nonnegative(),
  tokensUsed: z.number().int().nonnegative(),
  startedAt: z.string(),
})

export type RunBudget = z.infer<typeof RunBudgetSchema>

export const TaskCardSchema = z.object({
  taskId: z.string(),
  runId: z.string(),
  conversationId: z.string().nullable().default(null),
  title: z.string(),
  goal: z.string(),
  scope: z.array(z.string()),
  currentMode: ConversationModeSchema,
  currentStep: RunStepSchema,
  currentStatus: RunStatusSchema,
  controlMode: ControlModeSchema.default('normal'),
  overrideState: OverrideStateSchema.nullable().default(null),
  summaryDocumentPath: z.string().nullable().default(null),
  openQuestions: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  decisionNeededFromUser: z.array(z.string()).default([]),
  executionReadiness: TaskExecutionReadinessSchema.default(defaultTaskExecutionReadiness),
  confirmedItems: z.array(z.string()),
  pendingItems: z.array(z.string()),
  steps: z.array(TaskStepSchema),
  touchedFiles: z.array(z.string()),
  constraints: z.array(z.string()),
  risks: z.array(z.string()),
  verificationRequirements: z.array(z.string()),
})

export type TaskCard = z.infer<typeof TaskCardSchema>

export const VerificationStatusSchema = z.object({
  resultVerified: z.boolean(),
  handoffVerified: z.boolean(),
  verdict: VerifyVerdictSchema.optional(),
})

export type VerificationStatus = z.infer<typeof VerificationStatusSchema>

export const HandoffPacketSchema = z.object({
  taskId: z.string(),
  runId: z.string(),
  goal: z.string(),
  currentMode: ConversationModeSchema,
  currentStep: RunStepSchema,
  completedSteps: z.array(z.string()),
  pendingSteps: z.array(z.string()),
  touchedFiles: z.array(z.string()),
  decisions: z.array(z.string()),
  constraints: z.array(z.string()),
  risks: z.array(z.string()),
  nextRecommendedAction: z.string(),
  verificationStatus: VerificationStatusSchema,
})

export type HandoffPacket = z.infer<typeof HandoffPacketSchema>

export const FeedbackDecisionSchema = z.object({
  status: FeedbackStatusSchema,
  msg: z.string().default(''),
})

export type FeedbackDecision = z.infer<typeof FeedbackDecisionSchema>

export const ApprovalResultSchema = z.object({
  action: UserActionSchema,
  payload: FeedbackDecisionSchema.optional(),
})

export type ApprovalResult = z.infer<typeof ApprovalResultSchema>

export const ActiveApprovalSchema = z.object({
  approved: z.boolean(),
  action: UserActionSchema,
  summary: z.string(),
  riskLevel: RiskLevelSchema,
  toolName: z.string().optional(),
  targets: z.array(z.string()).default([]),
  updatedAt: z.string(),
})

export type ActiveApproval = z.infer<typeof ActiveApprovalSchema>

export const BudgetCheckResultSchema = z.object({
  allowed: z.boolean(),
  status: z.union([z.literal('ok'), z.literal('warning'), z.literal('budget_exceeded')]),
  reasons: z.array(z.string()),
  budget: RunBudgetSchema,
})

export type BudgetCheckResult = z.infer<typeof BudgetCheckResultSchema>

export const ToolPolicyDecisionSchema = z.object({
  allowed: z.boolean(),
  requiresApproval: z.boolean(),
  riskLevel: RiskLevelSchema,
  reasons: z.array(z.string()),
})

export type ToolPolicyDecision = z.infer<typeof ToolPolicyDecisionSchema>

export const AuditEventSchema = z.object({
  eventId: z.string(),
  runId: z.string(),
  at: z.string(),
  level: z.enum(['info', 'warn', 'error']),
  action: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
})

export type AuditEvent = z.infer<typeof AuditEventSchema>

export const TaskRecordSchema = TaskCardSchema.extend({
  budget: RunBudgetSchema,
  userConfirmedDone: z.boolean(),
  verifyPassed: z.boolean(),
  activeApproval: ActiveApprovalSchema.nullable().default(null),
  lastFeedback: FeedbackDecisionSchema.nullable().default(null),
  decisions: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type TaskRecord = z.infer<typeof TaskRecordSchema>
export const RunRecordSchema = TaskRecordSchema
export type RunRecord = TaskRecord

export const RunEventSchema = z.object({
  type: z.enum([
    'run.started',
    'run.updated',
    'tool.pending',
    'tool.finished',
    'approval.pending',
    'resume.received',
    'verify.finished',
    'run.completed',
    'run.failed',
  ]),
  runId: z.string(),
  at: z.string(),
  detail: z.record(z.unknown()).default({}),
})

export type RunEvent = z.infer<typeof RunEventSchema>

export interface StartRunInput {
  title: string
  goal: string
  scope?: string[]
  constraints?: string[]
  risks?: string[]
  verificationRequirements?: string[]
  mode?: ConversationMode
  controlMode?: ControlMode
  conversationId?: string | null
  summaryDocumentPath?: string | null
  openQuestions?: string[]
  assumptions?: string[]
  decisionNeededFromUser?: string[]
  executionReadiness?: Partial<TaskExecutionReadiness>
  overrideState?: OverrideState | null
  step?: RunStep
  status?: RunStatus
  budget?: Partial<Omit<RunBudget, 'startedAt'>>
}

export interface RunBudgetUsageDelta {
  llmSteps?: number
  toolCalls?: number
  userResumes?: number
  tokens?: number
}

export function buildDefaultBudget(overrides: Partial<Omit<RunBudget, 'startedAt'>> = {}): RunBudget {
  return RunBudgetSchema.parse({
    maxLlmSteps: 24,
    maxToolCalls: 24,
    maxUserResumes: 8,
    maxWallClockMs: 30 * 60 * 1000,
    maxTokens: 120_000,
    llmStepsUsed: 0,
    toolCallsUsed: 0,
    userResumesUsed: 0,
    tokensUsed: 0,
    startedAt: new Date().toISOString(),
    ...overrides,
  })
}

export function createTaskCard(input: StartRunInput, runId: string, taskId = `task_${randomUUID()}`): TaskCard {
  return TaskCardSchema.parse({
    taskId,
    runId,
    conversationId: input.conversationId ?? null,
    title: input.title,
    goal: input.goal,
    scope: input.scope ?? [],
    currentMode: input.mode ?? 'execution_intent',
    currentStep: input.step ?? 'collect',
    currentStatus: input.status ?? 'active',
    controlMode: input.controlMode ?? 'normal',
    overrideState: input.overrideState ?? null,
    summaryDocumentPath: input.summaryDocumentPath ?? null,
    openQuestions: input.openQuestions ?? [],
    assumptions: input.assumptions ?? [],
    decisionNeededFromUser: input.decisionNeededFromUser ?? [],
    executionReadiness: {
      technicallyReady: input.executionReadiness?.technicallyReady ?? false,
      boundaryApproved: input.executionReadiness?.boundaryApproved ?? false,
      policyAllowed: input.executionReadiness?.policyAllowed ?? false,
      missingInfo: input.executionReadiness?.missingInfo ?? [],
      risks: input.executionReadiness?.risks ?? [],
    },
    confirmedItems: [],
    pendingItems: [],
    steps: [],
    touchedFiles: [],
    constraints: input.constraints ?? [],
    risks: input.risks ?? [],
    verificationRequirements: input.verificationRequirements ?? [
      'Result matches the task goal',
      'No confirmed constraint is violated',
      'Handoff packet is complete enough for resume',
    ],
  })
}

export function createRunRecord(taskCard: TaskCard, input: StartRunInput): RunRecord {
  const now = new Date().toISOString()
  return TaskRecordSchema.parse({
    ...taskCard,
    budget: buildDefaultBudget(input.budget),
    userConfirmedDone: false,
    verifyPassed: false,
    activeApproval: null,
    lastFeedback: null,
    decisions: [],
    createdAt: now,
    updatedAt: now,
  })
}

export function createHandoffPacket(taskCard: TaskCard): HandoffPacket {
  const completedSteps = taskCard.steps.filter((step) => step.status === 'done').map((step) => step.name)
  const pendingSteps = taskCard.steps.filter((step) => step.status !== 'done').map((step) => step.name)

  return HandoffPacketSchema.parse({
    taskId: taskCard.taskId,
    runId: taskCard.runId,
    goal: taskCard.goal,
    currentMode: taskCard.currentMode,
    currentStep: taskCard.currentStep,
    completedSteps,
    pendingSteps,
    touchedFiles: taskCard.touchedFiles,
    decisions: [],
    constraints: taskCard.constraints,
    risks: taskCard.risks,
    nextRecommendedAction: pendingSteps[0] ?? 'Verify result and confirm completion',
    verificationStatus: {
      resultVerified: false,
      handoffVerified: false,
    },
  })
}

export function createAuditEvent(
  runId: string,
  level: AuditEvent['level'],
  action: string,
  message: string,
  details?: Record<string, unknown>,
): AuditEvent {
  return AuditEventSchema.parse({
    eventId: randomUUID(),
    runId,
    at: new Date().toISOString(),
    level,
    action,
    message,
    details,
  })
}

export function createRunEvent(
  runId: string,
  type: RunEvent['type'],
  detail: Record<string, unknown> = {},
): RunEvent {
  return RunEventSchema.parse({
    type,
    runId,
    at: new Date().toISOString(),
    detail,
  })
}
