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
import { evaluateTaskExecutionGate } from '../control/gate-evaluators.js'

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
    const controlMode = normalizeControlMode(taskCard.controlMode)

    // Step interception: execute→verify auto-inserts handoff_prepare
    if (taskCard.currentStep === 'verify') {
      try {
        const current = this.store.requireTaskCard(taskCard.runId)
        if (current.currentStep === 'execute') {
          this.prepareHandoff(taskCard.runId)
          const next = this.store.upsertTaskCard({ ...taskCard, currentStep: 'verify' })
          this.store.appendRunEvent(createRunEvent(taskCard.runId, 'run.updated', { currentStep: next.currentStep }))
          return next
        }
      } catch {
        // taskCard not found — first upsert, fall through
      }
    }

    if (taskCard.currentStep === 'execute' && controlMode !== 'direct') {
      // Step interception: plan→execute requires approval
      const run = this.store.getRun(taskCard.runId)
      if (run && !run.approvalPassed) {
        const redirected = { ...taskCard, currentStep: 'approval' as const, currentStatus: 'awaiting_approval' as const }
        const next = this.store.upsertTaskCard(redirected)
        this.store.appendRunEvent(createRunEvent(taskCard.runId, 'run.updated', { currentStep: next.currentStep, reason: 'approval_required' }))
        return next
      }

      const gate = evaluateTaskExecutionGate({
        taskCard,
        policyAllowed: taskCard.executionReadiness.policyAllowed,
        boundaryApproved: taskCard.executionReadiness.boundaryApproved,
        approvalPassed: run?.approvalPassed ?? false,
        overrideState: taskCard.overrideState,
        controlMode,
      })

      if (!gate.allowed) {
        const reverted = this.store.upsertTaskCard({ ...taskCard, currentStep: 'confirm_elements' })
        this.store.appendRunEvent(createRunEvent(taskCard.runId, 'run.updated', { currentStep: reverted.currentStep }))
        throw new Error(`Task execution gate blocked: ${gate.reasons.join('; ')}`)
      }
    }

    const next = this.store.upsertTaskCard(taskCard)
    this.store.appendRunEvent(createRunEvent(taskCard.runId, 'run.updated', { currentStep: next.currentStep }))
    return next
  }

  private prepareHandoff(runId: string): void {
    const run = this.store.requireRun(runId)
    const taskCard = this.store.requireTaskCard(runId)

    const changeSummary = run.decisions.length > 0 ? run.decisions.slice(-10) : []
    const impactScope = [...taskCard.scope]
    const manualCheckpoints = taskCard.risks.length > 0
      ? [...taskCard.risks]
      : [...taskCard.executionReadiness.missingInfo]

    this.store.patchHandoff(runId, {
      changeSummary,
      impactScope,
      manualCheckpoints,
    })

    this.store.patchTaskCard(runId, { currentStep: 'handoff_prepare' })
    this.store.appendRunEvent(createRunEvent(runId, 'run.updated', {
      currentStep: 'handoff_prepare',
      reason: 'auto_handoff_prepare',
    }))
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
