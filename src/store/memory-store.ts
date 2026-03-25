// src/store/memory-store.ts

import { join } from 'node:path'
import type { User } from '../types/user.js'
import type { Plan } from '../types/plan.js'
import type { AccessPolicy } from '../types/access-policy.js'
import type { AgentRun } from '../types/agent-run.js'
import type { RunStep } from '../types/run-step.js'
import type { ToolPolicy } from '../types/tool-policy.js'
import type { AuditEvent } from '../types/audit-event.js'
import { DEFAULT_BUDGET, ANONYMOUS_MONTHLY_RUN_LIMIT, LOGGED_IN_MONTHLY_RUN_LIMIT } from '../config/defaults.js'
import { JsonPersistence } from './json-persistence.js'

/** 默认数据目录：项目根下的 .data/ */
const DEFAULT_DATA_DIR = join(import.meta.dirname, '..', '..', '.data')

export class MemoryStore {
  private users = new Map<string, User>()
  private plans = new Map<string, Plan>()
  private accessPolicies = new Map<string, AccessPolicy>()
  private runs = new Map<string, AgentRun>()
  private steps: RunStep[] = []
  private toolPolicies = new Map<string, ToolPolicy>()
  private auditEvents: AuditEvent[] = []
  private persistence: JsonPersistence

  constructor(dataDir?: string) {
    this.persistence = new JsonPersistence(join(dataDir ?? DEFAULT_DATA_DIR, 'store.json'))

    // 从 JSON 加载已有数据
    const saved = this.persistence.load()
    for (const [k, v] of Object.entries(saved.users)) this.users.set(k, v as User)
    for (const [k, v] of Object.entries(saved.plans)) this.plans.set(k, v as Plan)
    for (const [k, v] of Object.entries(saved.accessPolicies)) this.accessPolicies.set(k, v as AccessPolicy)
    for (const [k, v] of Object.entries(saved.runs)) this.runs.set(k, v as AgentRun)
    this.steps = saved.steps as RunStep[]
    for (const [k, v] of Object.entries(saved.toolPolicies)) this.toolPolicies.set(k, v as ToolPolicy)
    this.auditEvents = saved.auditEvents as AuditEvent[]

    // 确保默认 Plan 存在
    if (!this.plans.has('anonymous')) {
      this.plans.set('anonymous', {
        id: 'anonymous',
        name: 'Anonymous',
        monthlyRunLimit: ANONYMOUS_MONTHLY_RUN_LIMIT,
        maxLlmStepsPerRun: DEFAULT_BUDGET.maxLlmSteps,
        maxToolCallsPerRun: DEFAULT_BUDGET.maxToolCalls,
        maxUserResumesPerRun: DEFAULT_BUDGET.maxUserResumes,
        maxTokensPerRun: DEFAULT_BUDGET.maxTokens,
        maxWallClockMsPerRun: DEFAULT_BUDGET.maxWallClockMs,
        modelMultipliers: {},
      })
    }

    if (!this.plans.has('personal')) {
      this.plans.set('personal', {
        id: 'personal',
        name: 'Personal',
        monthlyRunLimit: LOGGED_IN_MONTHLY_RUN_LIMIT,
        maxLlmStepsPerRun: DEFAULT_BUDGET.maxLlmSteps,
        maxToolCallsPerRun: DEFAULT_BUDGET.maxToolCalls,
        maxUserResumesPerRun: DEFAULT_BUDGET.maxUserResumes,
        maxTokensPerRun: DEFAULT_BUDGET.maxTokens,
        maxWallClockMsPerRun: DEFAULT_BUDGET.maxWallClockMs,
        modelMultipliers: {},
      })
    }

    if (!this.accessPolicies.has('default')) {
      this.accessPolicies.set('default', {
        id: 'default',
        allowedEmails: [],
        allowedDomains: [],
        blockedMcpServers: [],
        blockedTools: [],
        highRiskTools: [
          'file_editor_batch',
          'shell_exec',
          'git_push',
          'delete_directory',
          'production_api_write',
        ],
      })
    }

    // 保存一次确保文件存在
    this.flush()
  }

  /** 将内存数据写入 JSON */
  private flush(): void {
    this.persistence.save({
      users: Object.fromEntries(this.users),
      plans: Object.fromEntries(this.plans),
      accessPolicies: Object.fromEntries(this.accessPolicies),
      runs: Object.fromEntries(this.runs),
      steps: this.steps,
      toolPolicies: Object.fromEntries(this.toolPolicies),
      auditEvents: this.auditEvents,
    })
  }

  // —— User ——

  getUser(id: string): User | undefined {
    return this.users.get(id)
  }

  setUser(user: User): void {
    this.users.set(user.id, user)
    this.flush()
  }

  // —— Plan ——

  getPlan(id: string): Plan | undefined {
    return this.plans.get(id)
  }

  setPlan(plan: Plan): void {
    this.plans.set(plan.id, plan)
    this.flush()
  }

  // —— AccessPolicy ——

  getAccessPolicy(id: string): AccessPolicy | undefined {
    return this.accessPolicies.get(id)
  }

  setAccessPolicy(policy: AccessPolicy): void {
    this.accessPolicies.set(policy.id, policy)
    this.flush()
  }

  // —— AgentRun ——

  getRun(id: string): AgentRun | undefined {
    return this.runs.get(id)
  }

  setRun(run: AgentRun): void {
    this.runs.set(run.id, run)
    this.flush()
  }

  /** 统计某用户当月 Run 数量 */
  countUserMonthlyRuns(userId: string): number {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    let count = 0
    for (const run of this.runs.values()) {
      if (run.userId === userId && run.startedAt >= monthStart) {
        count++
      }
    }
    return count
  }

  /** 统计匿名（无 userId）本月 Run 数量，按 sessionId 区分 */
  countAnonymousMonthlyRuns(sessionId: string): number {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    let count = 0
    for (const run of this.runs.values()) {
      if (!run.userId && run.sessionId === sessionId && run.startedAt >= monthStart) {
        count++
      }
    }
    return count
  }

  // —— RunStep ——

  addStep(step: RunStep): void {
    this.steps.push(step)
    this.flush()
  }

  getStepsByRunId(runId: string): RunStep[] {
    return this.steps.filter(s => s.runId === runId)
  }

  // —— ToolPolicy ——

  getToolPolicy(toolName: string): ToolPolicy | undefined {
    return this.toolPolicies.get(toolName)
  }

  setToolPolicy(policy: ToolPolicy): void {
    this.toolPolicies.set(policy.toolName, policy)
    this.flush()
  }

  getAllToolPolicies(): ToolPolicy[] {
    return Array.from(this.toolPolicies.values())
  }

  // —— AuditEvent ——

  addAuditEvent(event: AuditEvent): void {
    this.auditEvents.push(event)
    this.flush()
  }

  getAuditEventsByRunId(runId: string): AuditEvent[] {
    return this.auditEvents.filter(e => e.runId === runId)
  }

  getAuditEventsByUserId(userId: string): AuditEvent[] {
    return this.auditEvents.filter(e => e.userId === userId)
  }
}
