// src/budget/budget-checker.ts

import type { AgentRun } from '../types/agent-run.js'

export type BudgetViolation =
  | 'LLM_STEPS'
  | 'TOOL_CALLS'
  | 'USER_RESUMES'
  | 'TOKENS'
  | 'WALL_CLOCK'

export class BudgetExceededError extends Error {
  constructor(public readonly violation: BudgetViolation) {
    super(`Budget exceeded: ${violation}`)
    this.name = 'BudgetExceededError'
  }
}

/**
 * 检查 Run 是否超出预算。
 * 如果超出，抛出 BudgetExceededError。
 */
export function ensureBudget(run: AgentRun): void {
  if (run.usage.llmSteps >= run.budget.maxLlmSteps) {
    throw new BudgetExceededError('LLM_STEPS')
  }
  if (run.usage.toolCalls >= run.budget.maxToolCalls) {
    throw new BudgetExceededError('TOOL_CALLS')
  }
  if (run.usage.userResumes >= run.budget.maxUserResumes) {
    throw new BudgetExceededError('USER_RESUMES')
  }
  const totalTokens = run.usage.promptTokens + run.usage.completionTokens
  if (totalTokens >= run.budget.maxTokens) {
    throw new BudgetExceededError('TOKENS')
  }
}

/**
 * 检查 Wall Clock 是否超限。
 * 需要在调度循环中定期调用。
 */
export function ensureWallClock(run: AgentRun): void {
  const elapsed = Date.now() - new Date(run.startedAt).getTime()
  if (elapsed >= run.budget.maxWallClockMs) {
    throw new BudgetExceededError('WALL_CLOCK')
  }
}

/**
 * 非抛出版本，返回是否仍在预算内。
 */
export function isWithinBudget(run: AgentRun): boolean {
  try {
    ensureBudget(run)
    ensureWallClock(run)
    return true
  } catch {
    return false
  }
}
