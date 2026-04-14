import { AgentGateAuditLogger } from '../audit/audit-logger.js'
import { AgentGateMemoryStore } from '../store/memory-store.js'
import {
  createRunEvent,
  type HandoffPacket,
  type RunRecord,
  type TaskCard,
  type VerificationStatus,
  type VerifyVerdict,
} from '../types/index.js'
import { AgentGateTaskOrchestrator } from './task-orchestrator.js'
import { AgentGateConversationOrchestrator } from './conversation-orchestrator.js'

export interface VerificationRequestContext {
  runId?: string
  conversationId?: string
  taskId?: string
  traceId: string
  now: () => string
}

export interface VerifyRunResult {
  verdict: VerifyVerdict
  reasons: string[]
  verificationStatus: VerificationStatus
  rollbackStep?: RunRecord['currentStep']
  rollbackStatus?: RunRecord['currentStatus']
}

export class AgentGateVerificationOrchestrator {
  constructor(
    private readonly store: AgentGateMemoryStore,
    private readonly audit: AgentGateAuditLogger,
    private readonly task: AgentGateTaskOrchestrator,
    private readonly conversation: AgentGateConversationOrchestrator,
  ) {}

  verifyRun(runId: string, userConfirmedDone = false, ctx?: VerificationRequestContext): VerifyRunResult {
    if (ctx?.runId && ctx.runId !== runId) {
      throw new Error('Request context runId does not match verify runId.')
    }

    let run = this.store.requireRun(runId)
    const taskCard = this.store.requireTaskCard(runId)
    const handoff = this.store.requireHandoff(runId)
    const recordedAt = ctx?.now()

    if (userConfirmedDone) {
      run = this.store.confirmDone(runId, true)
    }

    const { verdict, reasons, verificationStatus } = this.evaluateVerification(run, taskCard, handoff)

    this.store.markVerification(runId, verificationStatus)
    this.store.appendRunEvent(createRunEvent(runId, 'verify.finished', { verdict, reasons, traceId: ctx?.traceId, recordedAt }))

    if (verificationStatus.resultVerified && verificationStatus.handoffVerified && (run.userConfirmedDone || userConfirmedDone)) {
      const completedRun = this.store.transitionRun(runId, 'done', 'completed')
      const summaryDocumentPath = this.task.ensureSummaryDocumentPath(runId)
      this.store.writeTaskSummary({
        taskId: completedRun.taskId,
        runId: completedRun.runId,
        conversationId: completedRun.conversationId,
        taskTitle: completedRun.title,
        outcome: this.buildOutcome(completedRun, verdict, reasons),
        body: this.buildSummaryBody(completedRun, taskCard, handoff, verificationStatus, reasons, summaryDocumentPath),
        controlMode: taskCard.controlMode,
        taskStatus: 'task_done',
        touchedFiles: [...taskCard.touchedFiles],
        residualRisks: [...taskCard.risks],
        openQuestions: [...taskCard.openQuestions],
        assumptions: [...taskCard.assumptions],
        decisionNeededFromUser: [...taskCard.decisionNeededFromUser],
        nextTaskHints: [...handoff.pendingSteps],
        overrideState: taskCard.overrideState,
        createdAt: recordedAt,
        updatedAt: recordedAt,
      })

      this.store.appendRunEvent(createRunEvent(runId, 'run.completed', { verdict, summaryDocumentPath, traceId: ctx?.traceId, recordedAt }))
      this.audit.info(runId, 'verify.complete', 'Task verification completed and summary archived.', {
        verdict,
        summaryDocumentPath,
        traceId: ctx?.traceId,
        recordedAt,
        conversationState: this.conversation.getConversationRecord(runId).state,
      })
      return {
        verdict,
        reasons,
        verificationStatus,
      }
    }

    const rollback = this.resolveRollback(run, reasons, verificationStatus)
    if (rollback) {
      this.store.transitionRun(runId, rollback.step, rollback.status)
      this.store.appendRunEvent(
        createRunEvent(runId, 'verify.rollback', {
          verdict,
          reasons,
          rollbackStep: rollback.step,
          rollbackStatus: rollback.status,
          traceId: ctx?.traceId,
          recordedAt,
        }),
      )
      this.audit.warn(runId, 'verify.rollback', 'Verification failed and task was rolled back.', {
        verdict,
        reasons,
        rollbackStep: rollback.step,
        rollbackStatus: rollback.status,
        traceId: ctx?.traceId,
        recordedAt,
      })
      return { verdict, reasons, verificationStatus, rollbackStep: rollback.step, rollbackStatus: rollback.status }
    }

    this.audit.info(runId, 'verify.result', 'Run verification completed.', { verdict, reasons, traceId: ctx?.traceId, recordedAt })

    return { verdict, reasons, verificationStatus }
  }

  private evaluateVerification(
    run: RunRecord,
    taskCard: TaskCard,
    handoff: HandoffPacket,
  ): VerifyRunResult {
    const reasons: string[] = []
    let verdict: VerifyVerdict = 'pass'

    if (!taskCard.goal.trim()) {
      reasons.push('TaskCard.goal is empty.')
    }
    if (taskCard.steps.length === 0) {
      reasons.push('TaskCard.steps is empty.')
    }
    if (!handoff.nextRecommendedAction.trim()) {
      reasons.push('Handoff.nextRecommendedAction is empty.')
    }
    if (handoff.completedSteps.length === 0 && handoff.pendingSteps.length === 0) {
      reasons.push('Handoff has neither completedSteps nor pendingSteps.')
    }
    if (!run.userConfirmedDone) {
      reasons.push('User has not confirmed completion.')
    }

    if (reasons.length > 0) {
      verdict = reasons.some((reason) => reason.includes('User has not confirmed')) ? 'blocked' : 'failed'
    } else if (taskCard.risks.length > 0) {
      verdict = 'pass_with_risks'
    }

    const verificationStatus: VerificationStatus = {
      resultVerified: verdict === 'pass' || verdict === 'pass_with_risks',
      handoffVerified:
        handoff.nextRecommendedAction.trim().length > 0 &&
        (handoff.completedSteps.length > 0 || handoff.pendingSteps.length > 0),
      verdict,
    }

    return {
      verdict,
      reasons,
      verificationStatus,
    }
  }

  private buildOutcome(run: RunRecord, verdict: VerifyVerdict, reasons: string[]): string {
    const status = run.currentStatus === 'completed' ? 'task_done' : run.currentStatus
    const reasonText = reasons.length > 0 ? reasons.join('; ') : 'no blocking reasons'
    return `${status} / ${verdict} / ${reasonText}`
  }

  private buildSummaryBody(
    run: RunRecord,
    taskCard: TaskCard,
    handoff: HandoffPacket,
    verificationStatus: VerificationStatus,
    reasons: string[],
    summaryDocumentPath: string,
  ): string {
    const overrideState = taskCard.overrideState
    const lines = [
      `# Task Summary`,
      ``,
      `- Task: ${run.title}`,
      `- Goal: ${run.goal}`,
      `- Conversation: ${run.conversationId ?? 'conversation_default'}`,
      `- Control mode: ${taskCard.controlMode}`,
      `- Result verified: ${String(verificationStatus.resultVerified)}`,
      `- Handoff verified: ${String(verificationStatus.handoffVerified)}`,
      `- User confirmed done: ${String(run.userConfirmedDone)}`,
      `- Verification verdict: ${verificationStatus.verdict ?? 'unknown'}`,
      `- Summary path: ${summaryDocumentPath}`,
      ``,
      `## Completed Steps`,
      ...handoff.completedSteps.map((step) => `- ${step}`),
      ``,
      `## Pending Steps`,
      ...(handoff.pendingSteps.length > 0 ? handoff.pendingSteps.map((step) => `- ${step}`) : ['- none']),
      ``,
      `## Residual Risks`,
      ...(taskCard.risks.length > 0 ? taskCard.risks.map((risk) => `- ${risk}`) : ['- none']),
      ``,
      `## Open Questions`,
      ...(taskCard.openQuestions.length > 0 ? taskCard.openQuestions.map((question) => `- ${question}`) : ['- none']),
      ``,
      `## Assumptions`,
      ...(taskCard.assumptions.length > 0 ? taskCard.assumptions.map((assumption) => `- ${assumption}`) : ['- none']),
      ``,
      `## Decisions Needed From User`,
      ...(taskCard.decisionNeededFromUser.length > 0
        ? taskCard.decisionNeededFromUser.map((item) => `- ${item}`)
        : ['- none']),
      ``,
      `## Override`,
      `- Accepted: ${String(Boolean(overrideState?.confirmed))}`,
      `- Level: ${overrideState?.level ?? 'none'}`,
      `- Risks: ${overrideState?.acceptedRisks.join('; ') || 'none'}`,
      `- Skipped checks: ${overrideState?.skippedChecks.join('; ') || 'none'}`,
      ``,
      `## Verification Notes`,
      ...(reasons.length > 0 ? reasons.map((reason) => `- ${reason}`) : ['- no blocking reasons']),
    ]

    return lines.join('\n')
  }

  private resolveRollback(
    run: RunRecord,
    reasons: string[],
    verificationStatus: VerificationStatus,
  ): { step: RunRecord['currentStep']; status: RunRecord['currentStatus'] } | null {
    if (verificationStatus.verdict === 'blocked') {
      if (reasons.some((reason) => reason.includes('User has not confirmed'))) {
        return {
          step: 'verify',
          status: 'awaiting_user',
        }
      }

      return {
        step: 'confirm_elements',
        status: 'awaiting_user',
      }
    }

    if (verificationStatus.verdict === 'failed') {
      return {
        step: 'plan',
        status: 'active',
      }
    }

    if (verificationStatus.verdict === 'pass_with_risks' && !run.userConfirmedDone) {
      return {
        step: 'verify',
        status: 'awaiting_user',
      }
    }

    return null
  }
}
