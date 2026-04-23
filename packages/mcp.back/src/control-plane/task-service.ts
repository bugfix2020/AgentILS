import type { GateDecision } from '../control/gate-evaluators.js'
import type { AgentGateMemoryStore } from '../store/memory-store.js'
import type { HandoffPacket, RunBudgetUsageDelta, RunRecord, StartRunInput, TaskCard, VerificationStatus } from '../types/index.js'
import type { TaskReadiness, TaskRecordView } from '../store/task-store.js'

function createBlockedDecision(reason: string) {
  return {
    allowed: false,
    reasons: [reason],
    controlMode: 'normal' as const,
  } satisfies GateDecision
}

export interface TaskSurfaceState {
  runId: string
  task: TaskRecordView
  summary: ReturnType<AgentGateMemoryStore['getTaskSummary']>
  handoff: HandoffPacket
  taskGate: GateDecision
  taskStopGate: GateDecision
  summaryDocumentPath: string | null
}

export interface TaskEnvelope {
  run: RunRecord
  taskCard: TaskCard
  handoff: HandoffPacket
}

export interface TaskServiceApi {
  resolveRunId(preferredRunId?: string | null): string | null
  startTask(input: StartRunInput): RunRecord
  getRun(preferredRunId?: string | null): RunRecord | null
  getTaskRecord(preferredRunId?: string | null, summaryDocumentPath?: string | null): TaskRecordView | null
  getTaskSummary(preferredRunId?: string | null): ReturnType<AgentGateMemoryStore['getTaskSummary']> | null
  getTaskEnvelope(preferredRunId?: string | null): TaskEnvelope | null
  getTaskCard(preferredRunId?: string | null): TaskCard | null
  getHandoff(preferredRunId?: string | null): HandoffPacket | null
  getTaskReadiness(preferredRunId?: string | null): TaskReadiness | null
  previewTaskGate(preferredRunId?: string | null): GateDecision
  previewTaskStopGate(preferredRunId?: string | null): GateDecision
  appendDecision(runId: string, decision: string): RunRecord | null
  transitionTask(runId: string, step: TaskCard['currentStep'], status: TaskCard['currentStatus']): RunRecord | null
  patchTaskCard(runId: string, updates: Partial<TaskCard>): TaskCard | null
  patchHandoff(runId: string, updates: Partial<HandoffPacket>): HandoffPacket | null
  recordBudgetUsage(runId: string, delta: RunBudgetUsageDelta, apply?: boolean): RunRecord | null
  confirmTaskDone(runId: string, confirmed: boolean): RunRecord | null
  markVerification(runId: string, verificationStatus: VerificationStatus): void
  buildTaskSurface(preferredRunId?: string | null, summaryDocumentPath?: string | null): TaskSurfaceState | null
}

export class TaskService implements TaskServiceApi {
  constructor(private readonly store: AgentGateMemoryStore) {}

  resolveRunId(preferredRunId?: string | null): string | null {
    return this.store.resolveRunId(preferredRunId)
  }

  startTask(input: StartRunInput): RunRecord {
    return this.store.startRun(input)
  }

  getRun(preferredRunId?: string | null): RunRecord | null {
    const runId = this.resolveRunId(preferredRunId)
    if (!runId) {
      return null
    }

    try {
      return this.store.requireRun(runId)
    } catch {
      return null
    }
  }

  getTaskRecord(preferredRunId?: string | null, summaryDocumentPath?: string | null): TaskRecordView | null {
    const runId = this.resolveRunId(preferredRunId)
    if (!runId) {
      return null
    }

    try {
      return this.store.getTaskRecord(runId, summaryDocumentPath ?? null)
    } catch {
      return null
    }
  }

  getTaskSummary(preferredRunId?: string | null): ReturnType<AgentGateMemoryStore['getTaskSummary']> | null {
    const runId = this.resolveRunId(preferredRunId)
    if (!runId) {
      return null
    }

    try {
      return this.store.getTaskSummary(runId)
    } catch {
      return null
    }
  }

  getTaskEnvelope(preferredRunId?: string | null): TaskEnvelope | null {
    const run = this.getRun(preferredRunId)
    const taskCard = this.getTaskCard(preferredRunId)
    const handoff = this.getHandoff(preferredRunId)
    if (!run || !taskCard || !handoff) {
      return null
    }

    return {
      run,
      taskCard,
      handoff,
    }
  }

  getTaskCard(preferredRunId?: string | null): TaskCard | null {
    const runId = this.resolveRunId(preferredRunId)
    if (!runId) {
      return null
    }

    try {
      return this.store.requireTaskCard(runId)
    } catch {
      return null
    }
  }

  getHandoff(preferredRunId?: string | null): HandoffPacket | null {
    const runId = this.resolveRunId(preferredRunId)
    if (!runId) {
      return null
    }

    try {
      return this.store.requireHandoff(runId)
    } catch {
      return null
    }
  }

  getTaskReadiness(preferredRunId?: string | null): TaskReadiness | null {
    const task = this.getTaskRecord(preferredRunId)
    return task?.executionReadiness ?? null
  }

  previewTaskGate(preferredRunId?: string | null): GateDecision {
    const runId = this.resolveRunId(preferredRunId)
    if (!runId) {
      return createBlockedDecision('No active run is available for task gate preview.')
    }

    try {
      return this.store.previewTaskGate(runId)
    } catch {
      return createBlockedDecision(`Unknown runId: ${runId}`)
    }
  }

  previewTaskStopGate(preferredRunId?: string | null): GateDecision {
    const runId = this.resolveRunId(preferredRunId)
    if (!runId) {
      return createBlockedDecision('No active run is available for task stop preview.')
    }

    try {
      return this.store.previewTaskStopGate(runId)
    } catch {
      return createBlockedDecision(`Unknown runId: ${runId}`)
    }
  }

  appendDecision(runId: string, decision: string): RunRecord | null {
    try {
      return this.store.appendDecision(runId, decision)
    } catch {
      return null
    }
  }

  transitionTask(runId: string, step: TaskCard['currentStep'], status: TaskCard['currentStatus']): RunRecord | null {
    try {
      return this.store.transitionRun(runId, step, status)
    } catch {
      return null
    }
  }

  patchTaskCard(runId: string, updates: Partial<TaskCard>): TaskCard | null {
    try {
      return this.store.patchTaskCard(runId, updates)
    } catch {
      return null
    }
  }

  patchHandoff(runId: string, updates: Partial<HandoffPacket>): HandoffPacket | null {
    try {
      return this.store.patchHandoff(runId, updates)
    } catch {
      return null
    }
  }

  recordBudgetUsage(runId: string, delta: RunBudgetUsageDelta, apply = true): RunRecord | null {
    try {
      if (apply) {
        this.store.applyBudgetUsage(runId, delta)
      }
      return this.store.requireRun(runId)
    } catch {
      return null
    }
  }

  confirmTaskDone(runId: string, confirmed: boolean): RunRecord | null {
    try {
      return this.store.confirmDone(runId, confirmed)
    } catch {
      return null
    }
  }

  markVerification(runId: string, verificationStatus: VerificationStatus): void {
    this.store.markVerification(runId, verificationStatus)
  }

  buildTaskSurface(preferredRunId?: string | null, summaryDocumentPath?: string | null): TaskSurfaceState | null {
    const runId = this.resolveRunId(preferredRunId)
    if (!runId) {
      return null
    }

    const task = this.getTaskRecord(runId, summaryDocumentPath)
    const summary = this.getTaskSummary(runId)
    const handoff = this.getHandoff(runId)
    if (!task || !summary || !handoff) {
      return null
    }

    return {
      runId,
      task,
      summary,
      handoff,
      taskGate: this.previewTaskGate(runId),
      taskStopGate: this.previewTaskStopGate(runId),
      summaryDocumentPath: task.summaryDocumentPath,
    }
  }
}
