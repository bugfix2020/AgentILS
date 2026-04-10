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
import { AgentGateControlModeOrchestrator } from './control-mode-orchestrator.js'

function toPolicyOverrideState(overrideState: TaskCard['overrideState']) {
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

export interface VerifyRunResult {
  verdict: VerifyVerdict
  reasons: string[]
  verificationStatus: VerificationStatus
}

export class AgentGateVerificationOrchestrator {
  constructor(
    private readonly store: AgentGateMemoryStore,
    private readonly audit: AgentGateAuditLogger,
    private readonly task: AgentGateTaskOrchestrator,
    private readonly conversation: AgentGateConversationOrchestrator,
    private readonly controlMode: AgentGateControlModeOrchestrator,
  ) {}

  verifyRun(runId: string, userConfirmedDone = false): VerifyRunResult {
    const run = this.store.requireRun(runId)
    const taskCard = this.store.requireTaskCard(runId)
    const handoff = this.store.requireHandoff(runId)

    if (userConfirmedDone) {
      this.store.confirmDone(runId, true)
    }

    const { verdict, reasons, verificationStatus } = this.evaluateVerification(run, taskCard, handoff)

    this.store.markVerification(runId, verificationStatus)
    this.store.appendRunEvent(createRunEvent(runId, 'verify.finished', { verdict, reasons }))

    if (verificationStatus.resultVerified && verificationStatus.handoffVerified && (run.userConfirmedDone || userConfirmedDone)) {
      const completedRun = this.store.transitionRun(runId, 'done', 'completed')
      const summaryDocumentPath = this.task.ensureSummaryDocumentPath(runId)
      this.store.writeTaskSummary({
        taskId: completedRun.taskId,
        runId: completedRun.runId,
        title: completedRun.title,
        outcome: this.buildOutcome(completedRun, verdict, reasons),
        body: this.buildSummaryBody(completedRun, taskCard, handoff, verificationStatus, reasons, summaryDocumentPath),
        controlMode: taskCard.controlMode,
        overrideState: toPolicyOverrideState(taskCard.overrideState),
      })

      this.store.appendRunEvent(createRunEvent(runId, 'run.completed', { verdict, summaryDocumentPath }))
      this.audit.info(runId, 'verify.complete', 'Task verification completed and summary archived.', {
        verdict,
        summaryDocumentPath,
        conversationState: this.conversation.getConversationRecord(runId).state,
      })
      return {
        verdict,
        reasons,
        verificationStatus,
      }
    }

    this.audit.info(runId, 'verify.result', 'Run verification completed.', { verdict, reasons })

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
}
