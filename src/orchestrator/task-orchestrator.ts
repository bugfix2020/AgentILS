import { AgentGateAuditLogger } from '../audit/audit-logger.js'
import { AgentGateMemoryStore } from '../store/memory-store.js'
import {
  createRunEvent,
  type HandoffPacket,
  type RunRecord,
  type RunStatus,
  type RunStep,
  type OverrideState,
  type TaskCard,
} from '../types/index.js'
import { normalizeControlMode, type ControlMode } from '../control/control-modes.js'

export interface TaskEnvelope {
  run: RunRecord
  taskCard: TaskCard
  handoff: HandoffPacket
}

export class AgentGateTaskOrchestrator {
  constructor(
    private readonly store: AgentGateMemoryStore,
    private readonly audit: AgentGateAuditLogger,
  ) {}

  upsertTaskCard(taskCard: TaskCard): TaskCard {
    const next = this.store.upsertTaskCard(taskCard)
    this.store.appendRunEvent(createRunEvent(taskCard.runId, 'run.updated', { currentStep: next.currentStep }))
    return next
  }

  upsertHandoff(handoff: HandoffPacket): HandoffPacket {
    return this.store.upsertHandoff(handoff)
  }

  transitionTask(runId: string, currentStep: RunStep, currentStatus: RunStatus): RunRecord {
    return this.store.transitionRun(runId, currentStep, currentStatus)
  }

  setTaskControlMode(runId: string, controlMode: ControlMode | string | null | undefined, reason?: string): RunRecord {
    const normalized = normalizeControlMode(controlMode ?? null)
    const taskCard = this.store.requireTaskCard(runId)
    const nextTaskCard = this.store.patchTaskCard(runId, {
      controlMode: normalized,
    })
    const updated = this.store.updateRun(runId, {
      controlMode: normalized,
    })
    this.store.appendRunEvent(
      createRunEvent(runId, 'run.updated', {
        reason: reason ?? 'task.control_mode.updated',
        controlMode: normalized,
        taskId: nextTaskCard.taskId,
      }),
    )
    this.audit.info(runId, 'task.control_mode.updated', 'Task control mode updated.', {
      reason: reason ?? 'task.control_mode.updated',
      previousMode: taskCard.controlMode,
      nextMode: normalized,
    })
    return updated
  }

  setTaskOverrideState(runId: string, overrideState: OverrideState | null): TaskCard {
    return this.store.patchTaskCard(runId, {
      overrideState,
    })
  }

  ensureSummaryDocumentPath(runId: string): string {
    const taskCard = this.store.requireTaskCard(runId)
    const summaryDocumentPath = taskCard.summaryDocumentPath ?? this.store.summaryStore.resolveSummaryPath(taskCard.taskId)

    if (taskCard.summaryDocumentPath !== summaryDocumentPath) {
      this.store.patchTaskCard(runId, {
        summaryDocumentPath,
      })
    }

    return summaryDocumentPath
  }

  getTaskEnvelope(runId: string): TaskEnvelope {
    return {
      run: this.store.requireRun(runId),
      taskCard: this.store.requireTaskCard(runId),
      handoff: this.store.requireHandoff(runId),
    }
  }

  getTaskSummary(runId: string) {
    return this.store.getTaskSummary(runId)
  }
}
