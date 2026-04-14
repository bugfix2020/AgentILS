import { randomUUID } from 'node:crypto'
import {
  AuditEvent,
  AuditEventSchema,
  type HandoffPacket,
  createAuditEvent,
  createHandoffPacket,
  createRunRecord,
  createTaskCard,
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
import {
  evaluateConversationStopGate,
  evaluateTaskExecutionGate,
  evaluateTaskStopGate,
} from '../control/gate-evaluators.js'
import { createOverrideState } from '../control/override-policy.js'
import { AgentGateAuditStore, type AuditStoreAdapter } from './audit-store.js'
import { AgentGateConversationStore, type ConversationStoreAdapter } from './conversation-store.js'
import { AgentGateSummaryStore, type SummaryWriteInput, type TaskSummaryDocument } from './summary-store.js'
import { AgentGateTaskStore, type TaskStoreAdapter } from './task-store.js'
import {
  loadPersistentStore,
  type PersistentStoreMeta,
  resolveStateFilePath,
  savePersistentStore,
} from './persistence.js'

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
  readonly conversationStore: AgentGateConversationStore
  readonly taskStore: AgentGateTaskStore
  readonly summaryStore: AgentGateSummaryStore
  readonly auditStore: AgentGateAuditStore
  readonly stateFilePath: string
  private meta: PersistentStoreMeta

  constructor(stateFilePath?: string) {
    this.stateFilePath = resolveStateFilePath(stateFilePath)
    const snapshot = loadPersistentStore(this.stateFilePath)
    this.meta = snapshot.meta

    for (const run of snapshot.runs) {
      this.runs.set(run.runId, run)
    }
    for (const taskCard of snapshot.taskCards) {
      this.taskCards.set(taskCard.runId, taskCard)
    }
    for (const handoff of snapshot.handoffs) {
      this.handoffs.set(handoff.runId, handoff)
    }
    for (const event of snapshot.auditEvents) {
      const current = this.auditEvents.get(event.runId) ?? []
      current.push(event)
      this.auditEvents.set(event.runId, current)
    }
    for (const event of snapshot.runEvents) {
      const current = this.runEvents.get(event.runId) ?? []
      current.push(event)
      this.runEvents.set(event.runId, current)
    }

    this.conversationStore = new AgentGateConversationStore(this as ConversationStoreAdapter)
    this.taskStore = new AgentGateTaskStore(this as TaskStoreAdapter)
    this.summaryStore = new AgentGateSummaryStore()
    this.auditStore = new AgentGateAuditStore(this as AuditStoreAdapter)
  }

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
    this.markLastRun(runId)
    this.persist()

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

  getMeta(): PersistentStoreMeta {
    return { ...this.meta }
  }

  getConversationRecord(preferredRunId?: string | null) {
    return this.conversationStore.getRecord(preferredRunId)
  }

  getTaskRecord(runId: string, summaryDocumentPath: string | null = null) {
    const overrideState = this.getCurrentOverrideState(runId)
    return this.taskStore.getTaskRecord(runId, summaryDocumentPath, overrideState)
  }

  getTaskSummary(runId: string) {
    return this.taskStore.getTaskSummary(runId)
  }

  previewTaskGate(runId: string) {
    const taskCard = this.requireTaskCard(runId)
    return evaluateTaskExecutionGate({
      taskCard,
      policyAllowed: true,
      boundaryApproved: taskCard.scope.length > 0,
      overrideState: this.getCurrentOverrideState(runId),
      controlMode: taskCard.controlMode,
    })
  }

  previewTaskStopGate(runId: string) {
    return evaluateTaskStopGate(this.requireRun(runId))
  }

  previewConversationStopGate(runId: string, explicitConversationEnd = false) {
    const run = this.requireRun(runId)
    const taskDone = run.currentStatus === 'completed' || run.currentStatus === 'cancelled'
    return evaluateConversationStopGate(run, taskDone, explicitConversationEnd)
  }

  writeTaskSummary(input: SummaryWriteInput): TaskSummaryDocument {
    return this.summaryStore.writeSummary(input)
  }

  readTaskSummary(taskId: string): TaskSummaryDocument | null {
    return this.summaryStore.readSummary(taskId)
  }

  getAuditSummary(runId: string) {
    return this.auditStore.summarize(runId)
  }

  resolveRunId(preferredRunId?: string | null): string | null {
    if (preferredRunId && this.runs.has(preferredRunId)) {
      return preferredRunId
    }
    return this.meta.lastRunId && this.runs.has(this.meta.lastRunId) ? this.meta.lastRunId : null
  }

  updateRun(runId: string, updates: Partial<RunRecord>): RunRecord {
    const current = this.requireRun(runId)
    const next = RunRecordSchema.parse({
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    })
    this.runs.set(runId, next)
    this.markLastRun(runId)
    this.persist()
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
      controlMode: parsed.controlMode,
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
    this.markLastRun(parsed.runId)
    this.persist()

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
    this.markLastRun(parsed.runId)
    this.persist()
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
    this.markLastRun(parsed.runId)
    this.persist()
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
    this.markLastRun(event.runId)
    this.persist()
    return event
  }

  listRunEvents(runId: string): RunEvent[] {
    return [...(this.runEvents.get(runId) ?? [])]
  }

  getCurrentOverrideState(runId: string) {
    const taskCardOverride = this.taskCards.get(runId)?.overrideState ?? null
    if (taskCardOverride) {
      return taskCardOverride
    }

    const run = this.runs.get(runId)
    if (!run?.activeApproval) {
      return null
    }

    return createOverrideState({
      confirmed: run.activeApproval.approved,
      level: run.activeApproval.riskLevel === 'high' ? 'hard' : 'soft',
      summary: run.activeApproval.summary,
      acceptedRisks: [...run.activeApproval.targets],
      skippedChecks: [],
      confirmedAt: run.activeApproval.updatedAt,
      taskId: run.taskId,
      conversationId: run.conversationId,
      mode: run.controlMode,
    })
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

  private markLastRun(runId: string): void {
    this.meta = {
      lastRunId: runId,
      updatedAt: new Date().toISOString(),
    }
  }

  private persist(): void {
    savePersistentStore(
      {
        meta: this.meta,
        runs: this.listRuns(),
        taskCards: [...this.taskCards.values()],
        handoffs: [...this.handoffs.values()],
        auditEvents: [...this.auditEvents.values()].flat(),
        runEvents: [...this.runEvents.values()].flat(),
      },
      this.stateFilePath,
    )
  }
}
