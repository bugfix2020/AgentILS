import { randomUUID } from 'node:crypto'
import {
  AuditEvent,
  AuditEventSchema,
  createAuditEvent,
  createHandoffPacket,
  createRunRecord,
  createTaskCard,
  HandoffPacket,
  HandoffPacketSchema,
  RunBudgetUsageDelta,
  RunEvent,
  RunRecord,
  RunRecordSchema,
  RunStatus,
  RunStep,
  StartRunInput,
  TaskCard,
  TaskCardSchema,
  TaskStep,
  VerificationStatus,
} from '../types/index.js'

export interface StoreSnapshot {
  runs: RunRecord[]
  taskCards: TaskCard[]
  handoffs: HandoffPacket[]
  auditEvents: AuditEvent[]
  runEvents: RunEvent[]
}

export class AgentGateMemoryStore {
  private readonly runs = new Map<string, RunRecord>()
  private readonly taskCards = new Map<string, TaskCard>()
  private readonly handoffs = new Map<string, HandoffPacket>()
  private readonly auditEvents = new Map<string, AuditEvent[]>()
  private readonly runEvents = new Map<string, RunEvent[]>()

  startRun(input: StartRunInput): RunRecord {
    const runId = `run_${randomUUID()}`
    const taskCard = createTaskCard(input, runId)
    const run = createRunRecord(taskCard, input)
    const handoff = createHandoffPacket(taskCard)

    this.runs.set(runId, run)
    this.taskCards.set(runId, taskCard)
    this.handoffs.set(runId, handoff)
    this.appendAuditEvent(
      createAuditEvent(runId, 'info', 'run.start', `Run started for goal: ${run.goal}`),
    )

    return run
  }

  getRun(runId: string): RunRecord | undefined {
    return this.runs.get(runId)
  }

  requireRun(runId: string): RunRecord {
    const run = this.getRun(runId)
    if (!run) {
      throw new Error(`Unknown runId: ${runId}`)
    }
    return run
  }

  listRuns(): RunRecord[] {
    return [...this.runs.values()]
  }

  updateRun(runId: string, updates: Partial<RunRecord>): RunRecord {
    const current = this.requireRun(runId)
    const next = RunRecordSchema.parse({
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    })
    this.runs.set(runId, next)
    return next
  }

  transitionRun(runId: string, currentStep: RunStep, currentStatus: RunStatus): RunRecord {
    const taskCard = this.requireTaskCard(runId)
    this.upsertTaskCard({
      ...taskCard,
      currentStep,
      currentStatus,
    })
    return this.updateRun(runId, { currentStep, currentStatus })
  }

  applyBudgetUsage(runId: string, delta: RunBudgetUsageDelta): RunRecord {
    const run = this.requireRun(runId)
    const budget = {
      ...run.budget,
      llmStepsUsed: run.budget.llmStepsUsed + (delta.llmSteps ?? 0),
      toolCallsUsed: run.budget.toolCallsUsed + (delta.toolCalls ?? 0),
      userResumesUsed: run.budget.userResumesUsed + (delta.userResumes ?? 0),
      tokensUsed: run.budget.tokensUsed + (delta.tokens ?? 0),
    }
    return this.updateRun(runId, { budget })
  }

  appendDecision(runId: string, decision: string): RunRecord {
    const run = this.requireRun(runId)
    const decisions = [...run.decisions, decision]
    const handoff = this.requireHandoff(runId)

    this.upsertHandoff({
      ...handoff,
      decisions: [...handoff.decisions, decision],
    })

    return this.updateRun(runId, { decisions })
  }

  requireTaskCard(runId: string): TaskCard {
    const taskCard = this.taskCards.get(runId)
    if (!taskCard) {
      throw new Error(`Missing taskCard for runId: ${runId}`)
    }
    return taskCard
  }

  upsertTaskCard(taskCard: TaskCard): TaskCard {
    const parsed = TaskCardSchema.parse(taskCard)
    this.taskCards.set(parsed.runId, parsed)
    this.updateRun(parsed.runId, {
      title: parsed.title,
      goal: parsed.goal,
      scope: parsed.scope,
      currentMode: parsed.currentMode,
      currentStep: parsed.currentStep,
      currentStatus: parsed.currentStatus,
      constraints: parsed.constraints,
      risks: parsed.risks,
      verificationRequirements: parsed.verificationRequirements,
    })

    const currentHandoff = this.handoffs.get(parsed.runId)
    this.handoffs.set(
      parsed.runId,
      currentHandoff
        ? HandoffPacketSchema.parse({
            ...currentHandoff,
            goal: parsed.goal,
            currentMode: parsed.currentMode,
            currentStep: parsed.currentStep,
            touchedFiles: parsed.touchedFiles,
            constraints: parsed.constraints,
            risks: parsed.risks,
          })
        : createHandoffPacket(parsed),
    )

    return parsed
  }

  patchTaskCard(runId: string, updates: Partial<TaskCard>): TaskCard {
    const current = this.requireTaskCard(runId)
    return this.upsertTaskCard({
      ...current,
      ...updates,
      runId,
      taskId: current.taskId,
    })
  }

  addTaskStep(runId: string, step: Omit<TaskStep, 'id'> & { id?: string }): TaskCard {
    const taskCard = this.requireTaskCard(runId)
    return this.upsertTaskCard({
      ...taskCard,
      steps: [
        ...taskCard.steps,
        {
          id: step.id ?? randomUUID(),
          name: step.name,
          status: step.status,
          note: step.note,
        },
      ],
    })
  }

  requireHandoff(runId: string): HandoffPacket {
    const handoff = this.handoffs.get(runId)
    if (!handoff) {
      throw new Error(`Missing handoff for runId: ${runId}`)
    }
    return handoff
  }

  upsertHandoff(handoff: HandoffPacket): HandoffPacket {
    const parsed = HandoffPacketSchema.parse(handoff)
    this.handoffs.set(parsed.runId, parsed)
    return parsed
  }

  patchHandoff(runId: string, updates: Partial<HandoffPacket>): HandoffPacket {
    const current = this.requireHandoff(runId)
    return this.upsertHandoff({
      ...current,
      ...updates,
      runId,
      taskId: current.taskId,
    })
  }

  markVerification(runId: string, verificationStatus: VerificationStatus): void {
    const handoff = this.requireHandoff(runId)
    this.upsertHandoff({
      ...handoff,
      verificationStatus,
    })
    this.updateRun(runId, {
      verifyPassed: verificationStatus.resultVerified && verificationStatus.handoffVerified,
    })
  }

  confirmDone(runId: string, confirmed: boolean): RunRecord {
    return this.updateRun(runId, { userConfirmedDone: confirmed })
  }

  appendAuditEvent(event: AuditEvent): AuditEvent {
    const parsed = AuditEventSchema.parse(event)
    const current = this.auditEvents.get(parsed.runId) ?? []
    current.push(parsed)
    this.auditEvents.set(parsed.runId, current)
    return parsed
  }

  log(runId: string, level: AuditEvent['level'], action: string, message: string, details?: Record<string, unknown>): AuditEvent {
    return this.appendAuditEvent(createAuditEvent(runId, level, action, message, details))
  }

  listAuditEvents(runId: string): AuditEvent[] {
    return [...(this.auditEvents.get(runId) ?? [])]
  }

  appendRunEvent(event: RunEvent): RunEvent {
    const current = this.runEvents.get(event.runId) ?? []
    current.push(event)
    this.runEvents.set(event.runId, current)
    return event
  }

  listRunEvents(runId: string): RunEvent[] {
    return [...(this.runEvents.get(runId) ?? [])]
  }

  getSnapshot(): StoreSnapshot {
    return {
      runs: this.listRuns(),
      taskCards: [...this.taskCards.values()],
      handoffs: [...this.handoffs.values()],
      auditEvents: [...this.auditEvents.values()].flat(),
      runEvents: [...this.runEvents.values()].flat(),
    }
  }
}
