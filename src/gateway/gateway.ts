// src/gateway/gateway.ts

import type { User } from '../types/user.js'
import type { AgentRun } from '../types/agent-run.js'
import type { GateResult } from '../types/gate-result.js'
import type { MemoryStore } from '../store/memory-store.js'
import type { AuditLogger } from '../audit/audit-logger.js'
import { isEmailAllowlisted } from '../policy/tool-policy-checker.js'
import {
  DEFAULT_ANONYMOUS_PLAN_ID,
  DEFAULT_PERSONAL_PLAN_ID,
} from '../config/defaults.js'

let runCounter = 0

function generateRunId(): string {
  return `run_${Date.now()}_${++runCounter}`
}

export type GatewayRequest = {
  sessionId: string
  userId?: string
  entryPrompt: string
  selectedModel: string
  selectedAgent?: string
  selectedPromptFile?: string
  workspaceId?: string
}

export class Gateway {
  constructor(
    private store: MemoryStore,
    private audit: AuditLogger
  ) {}

  /**
   * 网关检查顺序：
   * 1. 识别 user identity
   * 2. 校验登录状态
   * 3. 校验 email allowlist / domain allowlist
   * 4. 校验 monthly quota
   * 5. 计算本次 run budget
   * 6. 创建 run 记录
   * 7. 放行
   */
  process(req: GatewayRequest): GateResult {
    // —— 1. 获取用户 ——
    let user: User | undefined
    if (req.userId) {
      user = this.store.getUser(req.userId)
    }

    // —— 2. 确定 Plan ——
    const planId = user?.planId ?? (user ? DEFAULT_PERSONAL_PLAN_ID : DEFAULT_ANONYMOUS_PLAN_ID)
    const plan = this.store.getPlan(planId)
    if (!plan) {
      return { type: 'PLAN_RESTRICTED' }
    }

    // —— 3. 白名单检查（仅已登录用户） ——
    const accessPolicy = this.store.getAccessPolicy('default')
    if (user && accessPolicy) {
      const hasAllowlistConfig =
        accessPolicy.allowedEmails.length > 0 || accessPolicy.allowedDomains.length > 0
      if (hasAllowlistConfig && !isEmailAllowlisted(user.email, accessPolicy)) {
        this.audit.log({
          userId: user.id,
          eventType: 'gateway',
          eventName: 'email_not_allowed',
          payload: { email: user.email },
        })
        return { type: 'EMAIL_NOT_ALLOWED' }
      }
    }

    // —— 4. 额度检查 ——
    let monthlyRuns: number
    if (user) {
      monthlyRuns = this.store.countUserMonthlyRuns(user.id)
    } else {
      monthlyRuns = this.store.countAnonymousMonthlyRuns(req.sessionId)
    }

    if (monthlyRuns >= plan.monthlyRunLimit) {
      if (!user) {
        // 匿名额度耗尽，要求登录
        this.audit.log({
          eventType: 'gateway',
          eventName: 'require_login',
          payload: { sessionId: req.sessionId, monthlyRuns },
        })
        return { type: 'REQUIRE_LOGIN' }
      }
      this.audit.log({
        userId: user.id,
        eventType: 'gateway',
        eventName: 'quota_exceeded',
        payload: { monthlyRuns, limit: plan.monthlyRunLimit },
      })
      return { type: 'QUOTA_EXCEEDED' }
    }

    // —— 5. 计算 Budget ——
    const budget = {
      maxLlmSteps: plan.maxLlmStepsPerRun,
      maxToolCalls: plan.maxToolCallsPerRun,
      maxUserResumes: plan.maxUserResumesPerRun,
      maxTokens: plan.maxTokensPerRun,
      maxWallClockMs: plan.maxWallClockMsPerRun,
    }

    // —— 6. 创建 Run ——
    const now = new Date().toISOString()
    const run: AgentRun = {
      id: generateRunId(),
      sessionId: req.sessionId,
      userId: user?.id,
      workspaceId: req.workspaceId,
      entryPrompt: req.entryPrompt,
      selectedModel: req.selectedModel,
      selectedAgent: req.selectedAgent,
      selectedPromptFile: req.selectedPromptFile,
      status: 'created',
      budget,
      usage: {
        llmSteps: 0,
        toolCalls: 0,
        userResumes: 0,
        promptTokens: 0,
        completionTokens: 0,
      },
      feedbackCollected: false,
      startedAt: now,
    }

    this.store.setRun(run)

    this.audit.log({
      userId: user?.id,
      runId: run.id,
      eventType: 'gateway',
      eventName: 'run_created',
      payload: {
        planId,
        sessionId: req.sessionId,
        model: req.selectedModel,
        agent: req.selectedAgent,
      },
    })

    // —— 7. 放行 ——
    return { type: 'ALLOW', run }
  }
}
