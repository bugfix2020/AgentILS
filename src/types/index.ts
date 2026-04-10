import { randomUUID } from 'node:crypto'
import { z } from 'zod'

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

export const verifyVerdicts = [
  'pass',
  'pass_with_risks',
  'blocked',
  'failed',
] as const

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
  title: z.string(),
  goal: z.string(),
  scope: z.array(z.string()),
  currentMode: ConversationModeSchema,
  currentStep: RunStepSchema,
  confirmedItems: z.array(z.string()),
  pendingItems: z.array(z.string()),
  steps: z.array(TaskStepSchema),
  touchedFiles: z.array(z.string()),
  constraints: z.array(z.string()),
  risks: z.array(z.string()),
  verificationRequirements: z.array(z.string()),
  currentStatus: RunStatusSchema,
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

export const RunRecordSchema = z.object({
  runId: z.string(),
  taskId: z.string(),
  title: z.string(),
  goal: z.string(),
  scope: z.array(z.string()),
  currentMode: ConversationModeSchema,
  currentStep: RunStepSchema,
  currentStatus: RunStatusSchema,
  constraints: z.array(z.string()),
  risks: z.array(z.string()),
  verificationRequirements: z.array(z.string()),
  budget: RunBudgetSchema,
  userConfirmedDone: z.boolean(),
  verifyPassed: z.boolean(),
  decisions: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type RunRecord = z.infer<typeof RunRecordSchema>

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
    title: input.title,
    goal: input.goal,
    scope: input.scope ?? [],
    currentMode: input.mode ?? 'execution_intent',
    currentStep: input.step ?? 'collect',
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
    currentStatus: input.status ?? 'active',
  })
}

export function createRunRecord(taskCard: TaskCard, input: StartRunInput): RunRecord {
  const now = new Date().toISOString()
  return RunRecordSchema.parse({
    runId: taskCard.runId,
    taskId: taskCard.taskId,
    title: taskCard.title,
    goal: taskCard.goal,
    scope: taskCard.scope,
    currentMode: taskCard.currentMode,
    currentStep: taskCard.currentStep,
    currentStatus: taskCard.currentStatus,
    constraints: taskCard.constraints,
    risks: taskCard.risks,
    verificationRequirements: taskCard.verificationRequirements,
    budget: buildDefaultBudget(input.budget),
    userConfirmedDone: false,
    verifyPassed: false,
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
