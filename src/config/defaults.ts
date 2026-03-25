// src/config/defaults.ts

/** 默认 Run 预算 */
export const DEFAULT_BUDGET = {
  maxLlmSteps: 8,
  maxToolCalls: 5,
  maxUserResumes: 2,
  maxTokens: 200_000,
  maxWallClockMs: 60_000,
} as const

/** 匿名用户月度免费 Run 数 */
export const ANONYMOUS_MONTHLY_RUN_LIMIT = 50

/** 已登录个人用户月度 Run 数 */
export const LOGGED_IN_MONTHLY_RUN_LIMIT = 200

/** 默认 Plan ID */
export const DEFAULT_ANONYMOUS_PLAN_ID = 'anonymous'
export const DEFAULT_PERSONAL_PLAN_ID = 'personal'
