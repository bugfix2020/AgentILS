// src/orchestrator/orchestrator.ts

import type { AgentRun } from '../types/agent-run.js'
import type { RunStep, RunStepType } from '../types/run-step.js'
import type { MemoryStore } from '../store/memory-store.js'
import type { AuditLogger } from '../audit/audit-logger.js'
import { ensureBudget, ensureWallClock, BudgetExceededError } from '../budget/budget-checker.js'

let stepCounter = 0

function generateStepId(): string {
  return `step_${Date.now()}_${++stepCounter}`
}

export class Orchestrator {
  constructor(
    private store: MemoryStore,
    private audit: AuditLogger
  ) {}

  /**
   * 开始执行 Run，将状态从 created → running
   */
  startRun(runId: string): AgentRun {
    const run = this.store.getRun(runId)
    if (!run) throw new Error(`Run not found: ${runId}`)
    if (run.status !== 'created') throw new Error(`Run ${runId} is not in 'created' state`)

    run.status = 'running'
    this.store.setRun(run)

    this.audit.log({
      userId: run.userId,
      runId: run.id,
      eventType: 'orchestrator',
      eventName: 'run_started',
    })

    return run
  }

  /**
   * 在执行步骤前检查预算
   * 如果超限，自动将 Run 标记为 budget_exceeded 并抛出错误
   */
  checkBudgetOrExceed(runId: string): void {
    const run = this.store.getRun(runId)
    if (!run) throw new Error(`Run not found: ${runId}`)

    try {
      ensureBudget(run)
      ensureWallClock(run)
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        run.status = 'budget_exceeded'
        run.endedAt = new Date().toISOString()
        this.store.setRun(run)

        this.audit.log({
          userId: run.userId,
          runId: run.id,
          eventType: 'orchestrator',
          eventName: 'budget_exceeded',
          payload: { violation: err.violation },
        })
      }
      throw err
    }
  }

  /**
   * 记录一个 Step 的开始
   */
  beginStep(runId: string, type: RunStepType, name: string, request?: unknown): RunStep {
    const step: RunStep = {
      id: generateStepId(),
      runId,
      type,
      name,
      status: 'started',
      request,
      startedAt: new Date().toISOString(),
    }
    this.store.addStep(step)

    this.audit.log({
      runId,
      eventType: 'step',
      eventName: 'step_started',
      payload: { stepId: step.id, type, name },
    })

    return step
  }

  /**
   * 标记 Step 完成，并递增 Run usage 对应计数器
   */
  completeStep(step: RunStep, response?: unknown): void {
    step.status = 'completed'
    step.response = response
    step.endedAt = new Date().toISOString()

    const run = this.store.getRun(step.runId)
    if (run) {
      if (step.type === 'llm') run.usage.llmSteps++
      if (step.type === 'tool') run.usage.toolCalls++
      if (step.type === 'elicitation') run.usage.userResumes++
      this.store.setRun(run)
    }

    this.audit.log({
      runId: step.runId,
      eventType: 'step',
      eventName: 'step_completed',
      payload: { stepId: step.id, type: step.type, name: step.name },
    })
  }

  /**
   * 标记 Step 失败
   */
  failStep(step: RunStep, error?: unknown): void {
    step.status = 'failed'
    step.response = error
    step.endedAt = new Date().toISOString()

    this.audit.log({
      runId: step.runId,
      eventType: 'step',
      eventName: 'step_failed',
      payload: { stepId: step.id, type: step.type, name: step.name },
    })
  }

  /**
   * 将 Run 标记为等待用户输入
   */
  waitUser(runId: string): void {
    const run = this.store.getRun(runId)
    if (!run) throw new Error(`Run not found: ${runId}`)
    run.status = 'waiting_user'
    this.store.setRun(run)
  }

  /**
   * 用户返回后恢复 Run 为 running
   */
  resumeRun(runId: string): void {
    const run = this.store.getRun(runId)
    if (!run) throw new Error(`Run not found: ${runId}`)
    run.status = 'running'
    this.store.setRun(run)
  }

  /**
   * 正常完成 Run
   */
  completeRun(runId: string): void {
    const run = this.store.getRun(runId)
    if (!run) throw new Error(`Run not found: ${runId}`)
    run.status = 'completed'
    run.endedAt = new Date().toISOString()
    this.store.setRun(run)

    this.audit.log({
      userId: run.userId,
      runId: run.id,
      eventType: 'orchestrator',
      eventName: 'run_completed',
      payload: { usage: run.usage },
    })
  }

  /**
   * 标记 Run 失败
   */
  failRun(runId: string, reason?: string): void {
    const run = this.store.getRun(runId)
    if (!run) throw new Error(`Run not found: ${runId}`)
    run.status = 'failed'
    run.endedAt = new Date().toISOString()
    this.store.setRun(run)

    this.audit.log({
      userId: run.userId,
      runId: run.id,
      eventType: 'orchestrator',
      eventName: 'run_failed',
      payload: { reason },
    })
  }

  /**
   * 标记 Run 被阻断
   */
  blockRun(runId: string, reason: string): void {
    const run = this.store.getRun(runId)
    if (!run) throw new Error(`Run not found: ${runId}`)
    run.status = 'blocked'
    run.endedAt = new Date().toISOString()
    this.store.setRun(run)

    this.audit.log({
      userId: run.userId,
      runId: run.id,
      eventType: 'orchestrator',
      eventName: 'run_blocked',
      payload: { reason },
    })
  }

  /**
   * 取消 Run
   */
  cancelRun(runId: string): void {
    const run = this.store.getRun(runId)
    if (!run) throw new Error(`Run not found: ${runId}`)
    run.status = 'cancelled'
    run.endedAt = new Date().toISOString()
    this.store.setRun(run)

    this.audit.log({
      userId: run.userId,
      runId: run.id,
      eventType: 'orchestrator',
      eventName: 'run_cancelled',
    })
  }

  /**
   * 获取 Run 当前快照
   */
  getRunSnapshot(runId: string): { run: AgentRun; steps: RunStep[] } | undefined {
    const run = this.store.getRun(runId)
    if (!run) return undefined
    const steps = this.store.getStepsByRunId(runId)
    return { run, steps }
  }
}
