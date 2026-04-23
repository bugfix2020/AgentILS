import { BudgetCheckResult, BudgetCheckResultSchema, RunBudget, RunBudgetUsageDelta } from '../types/index.js'

function buildReasons(budget: RunBudget): string[] {
  const reasons: string[] = []

  if (budget.llmStepsUsed > budget.maxLlmSteps) {
    reasons.push(`LLM step budget exceeded: ${budget.llmStepsUsed}/${budget.maxLlmSteps}`)
  }
  if (budget.toolCallsUsed > budget.maxToolCalls) {
    reasons.push(`Tool call budget exceeded: ${budget.toolCallsUsed}/${budget.maxToolCalls}`)
  }
  if (budget.userResumesUsed > budget.maxUserResumes) {
    reasons.push(`User resume budget exceeded: ${budget.userResumesUsed}/${budget.maxUserResumes}`)
  }
  if (budget.tokensUsed > budget.maxTokens) {
    reasons.push(`Token budget exceeded: ${budget.tokensUsed}/${budget.maxTokens}`)
  }

  const elapsedMs = Date.now() - new Date(budget.startedAt).getTime()
  if (elapsedMs > budget.maxWallClockMs) {
    reasons.push(`Wall clock budget exceeded: ${elapsedMs}/${budget.maxWallClockMs}`)
  }

  return reasons
}

export function previewBudgetUsage(budget: RunBudget, delta: RunBudgetUsageDelta = {}): RunBudget {
  return {
    ...budget,
    llmStepsUsed: budget.llmStepsUsed + (delta.llmSteps ?? 0),
    toolCallsUsed: budget.toolCallsUsed + (delta.toolCalls ?? 0),
    userResumesUsed: budget.userResumesUsed + (delta.userResumes ?? 0),
    tokensUsed: budget.tokensUsed + (delta.tokens ?? 0),
  }
}

export function evaluateBudget(budget: RunBudget, delta: RunBudgetUsageDelta = {}): BudgetCheckResult {
  const nextBudget = previewBudgetUsage(budget, delta)
  const reasons = buildReasons(nextBudget)
  const nearingLimit =
    nextBudget.llmStepsUsed >= nextBudget.maxLlmSteps * 0.8 ||
    nextBudget.toolCallsUsed >= nextBudget.maxToolCalls * 0.8 ||
    nextBudget.tokensUsed >= nextBudget.maxTokens * 0.8

  return BudgetCheckResultSchema.parse({
    allowed: reasons.length === 0,
    status: reasons.length > 0 ? 'budget_exceeded' : nearingLimit ? 'warning' : 'ok',
    reasons,
    budget: nextBudget,
  })
}
