import { AgentGateAuditLogger } from '../audit/audit-logger.js'
import { AgentGateMemoryStore } from '../store/memory-store.js'
import {
  ApprovalResultSchema,
  createOverrideState,
  createRunEvent,
  type ApprovalResult,
  type FeedbackDecision,
  type OverrideState as TaskOverrideState,
  type RunRecord,
} from '../types/index.js'
import { nextControlMode, type ControlModeSignal } from '../control/mode-transitions.js'
import { normalizeControlMode, type ControlMode } from '../control/control-modes.js'
import { type OverrideState as PolicyOverrideState } from '../control/override-policy.js'
import { AgentGateTaskOrchestrator } from './task-orchestrator.js'

function toPolicyOverrideState(overrideState?: TaskOverrideState | null): PolicyOverrideState | null {
  if (!overrideState) {
    return null
  }

  return {
    confirmed: overrideState.confirmed,
    level: overrideState.level,
    summary: overrideState.summary,
    acceptedRisks: [...overrideState.acceptedRisks],
    skippedChecks: [...overrideState.skippedChecks],
    confirmedAt: overrideState.confirmedAt,
    taskId: overrideState.taskId,
    conversationId: overrideState.conversationId ?? undefined,
    mode: overrideState.mode,
  }
}

export class AgentGateControlModeOrchestrator {
  constructor(
    private readonly store: AgentGateMemoryStore,
    private readonly audit: AgentGateAuditLogger,
    private readonly task: AgentGateTaskOrchestrator,
  ) {}

  getControlMode(runId: string): ControlMode {
    return normalizeControlMode(this.store.requireRun(runId).currentMode)
  }

  setControlMode(
    runId: string,
    controlMode: ControlMode | string | null | undefined,
    reason = 'control.mode.updated',
  ): RunRecord {
    return this.task.setTaskControlMode(runId, controlMode, reason)
  }

  applyControlModeSignal(
    runId: string,
    signal: ControlModeSignal,
    overrideState?: TaskOverrideState | null,
    reason = 'control.mode.signal',
  ): RunRecord {
    const currentRun = this.store.requireRun(runId)
    const taskCard = this.store.requireTaskCard(runId)
    const nextMode = nextControlMode(
      currentRun.currentMode,
      signal,
      toPolicyOverrideState(overrideState ?? taskCard.overrideState),
    )
    return this.setControlMode(runId, nextMode, `${reason}:${signal}`)
  }

  recordApproval(runId: string, summary: string, result: ApprovalResult): ApprovalResult {
    const parsed = ApprovalResultSchema.parse(result)
    const currentRun = this.store.requireRun(runId)
    const approvalState: RunRecord['activeApproval'] = {
      approved: parsed.action === 'accept',
      action: parsed.action,
      summary,
      riskLevel: currentRun.activeApproval?.riskLevel ?? 'medium',
      toolName: currentRun.activeApproval?.toolName,
      targets: currentRun.activeApproval?.targets ?? [],
      updatedAt: new Date().toISOString(),
    }

    if (parsed.action === 'decline') {
      this.store.transitionRun(runId, 'cancelled', 'cancelled')
      this.store.confirmDone(runId, false)
      this.task.setTaskOverrideState(runId, null)
    } else if (parsed.action === 'cancel') {
      this.store.transitionRun(runId, 'approval', 'awaiting_approval')
      this.store.confirmDone(runId, false)
      this.task.setTaskOverrideState(runId, null)
    } else if (parsed.payload?.status === 'revise') {
      this.store.transitionRun(runId, 'confirm_elements', 'awaiting_user')
      this.store.confirmDone(runId, false)
      this.store.updateRun(runId, { verifyPassed: false })
      this.task.setTaskOverrideState(runId, null)
    } else if (parsed.payload?.status === 'done') {
      this.store.transitionRun(runId, 'verify', 'active')
      this.store.confirmDone(runId, true)
      this.store.updateRun(runId, { verifyPassed: false })
    } else {
      this.store.transitionRun(runId, 'execute', 'active')
    }

    if (parsed.action === 'accept') {
      const overrideState = createOverrideState({
        confirmed: true,
        taskId: currentRun.taskId,
        conversationId: currentRun.conversationId,
        level: approvalState.riskLevel === 'high' ? 'hard' : 'soft',
        summary,
        acceptedRisks: approvalState.targets,
        skippedChecks: [],
        mode: currentRun.currentMode,
      })
      this.task.setTaskOverrideState(runId, overrideState)

      const signal: ControlModeSignal = normalizeControlMode(currentRun.currentMode) === 'normal' ? 'override' : 'repeat_override'
      this.applyControlModeSignal(runId, signal, overrideState, 'approval.override')
    }

    this.store.updateRun(runId, {
      activeApproval: approvalState,
      userConfirmedDone: parsed.payload?.status === 'done',
    })
    this.store.appendDecision(runId, `${parsed.action}: ${parsed.payload?.msg || summary}`)
    this.store.appendRunEvent(createRunEvent(runId, 'approval.pending', { summary, result: parsed }))
    this.audit.info(runId, 'approval.result', 'Approval captured.', { summary, result: parsed })
    return parsed
  }

  recordFeedback(runId: string, decision: FeedbackDecision): FeedbackDecision {
    if (decision.status === 'done') {
      this.store.transitionRun(runId, 'verify', 'active')
      this.store.confirmDone(runId, true)
    } else if (decision.status === 'revise') {
      this.store.transitionRun(runId, 'confirm_elements', 'awaiting_user')
      this.store.confirmDone(runId, false)
      this.store.updateRun(runId, { verifyPassed: false })
    } else {
      this.store.transitionRun(runId, 'execute', 'active')
    }

    this.store.updateRun(runId, {
      lastFeedback: decision,
      userConfirmedDone: decision.status === 'done',
    })
    this.store.appendDecision(runId, `${decision.status}: ${decision.msg}`)
    this.store.appendRunEvent(createRunEvent(runId, 'resume.received', { decision }))
    this.audit.info(runId, 'feedback.result', 'Feedback captured.', decision)
    return decision
  }
}
