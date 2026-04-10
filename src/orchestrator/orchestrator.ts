import { evaluateBudget } from '../budget/budget-checker.js'
import { AgentGateAuditLogger } from '../audit/audit-logger.js'
import { evaluateToolPolicy, PolicyContext } from '../policy/tool-policy-checker.js'
import { AgentGateMemoryStore } from '../store/memory-store.js'
import {
  ApprovalResult,
  ApprovalResultSchema,
  createRunEvent,
  FeedbackDecision,
  HandoffPacket,
  RunBudgetUsageDelta,
  StartRunInput,
  TaskCard,
  VerificationStatus,
  VerifyVerdict,
} from '../types/index.js'

export interface VerifyRunResult {
  verdict: VerifyVerdict
  reasons: string[]
  verificationStatus: VerificationStatus
}

export class AgentGateOrchestrator {
  readonly audit: AgentGateAuditLogger

  constructor(readonly store: AgentGateMemoryStore) {
    this.audit = new AgentGateAuditLogger(store)
  }

  startRun(input: StartRunInput) {
    const run = this.store.startRun(input)
    this.store.appendRunEvent(createRunEvent(run.runId, 'run.started', { goal: run.goal }))
    return run
  }

  checkBudget(runId: string, delta: RunBudgetUsageDelta = {}, apply = false) {
    const run = this.store.requireRun(runId)
    const result = evaluateBudget(run.budget, delta)

    if (apply) {
      this.store.applyBudgetUsage(runId, delta)
    }

    if (!result.allowed) {
      this.store.transitionRun(runId, run.currentStep, 'budget_exceeded')
      this.audit.warn(runId, 'budget.exceeded', 'Run budget exceeded.', { reasons: result.reasons })
    }

    return result
  }

  evaluatePolicy(runId: string, toolName: string, targets: string[] = [], context: PolicyContext = {}) {
    const decision = evaluateToolPolicy(toolName, targets, context)
    this.audit.info(runId, 'policy.check', `Policy checked for tool ${toolName}.`, {
      toolName,
      targets,
      decision,
    })
    return decision
  }

  upsertTaskCard(taskCard: TaskCard) {
    const next = this.store.upsertTaskCard(taskCard)
    this.store.appendRunEvent(createRunEvent(taskCard.runId, 'run.updated', { currentStep: next.currentStep }))
    return next
  }

  upsertHandoff(handoff: HandoffPacket) {
    return this.store.upsertHandoff(handoff)
  }

  recordApproval(runId: string, summary: string, result: ApprovalResult) {
    const parsed = ApprovalResultSchema.parse(result)
    this.store.appendDecision(runId, `${parsed.action}: ${parsed.payload?.msg || summary}`)
    this.store.appendRunEvent(createRunEvent(runId, 'approval.pending', { summary, result: parsed }))
    this.audit.info(runId, 'approval.result', 'Approval captured.', { summary, result: parsed })
    return parsed
  }

  recordFeedback(runId: string, decision: FeedbackDecision) {
    this.store.appendDecision(runId, `${decision.status}: ${decision.msg}`)
    this.store.appendRunEvent(createRunEvent(runId, 'resume.received', { decision }))
    this.audit.info(runId, 'feedback.result', 'Feedback captured.', decision)
    return decision
  }

  verifyRun(runId: string, userConfirmedDone = false): VerifyRunResult {
    const run = this.store.requireRun(runId)
    const taskCard = this.store.requireTaskCard(runId)
    const handoff = this.store.requireHandoff(runId)

    if (userConfirmedDone) {
      this.store.confirmDone(runId, true)
    }

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
    if (handoff.pendingSteps.length === 0 && handoff.completedSteps.length === 0) {
      reasons.push('Handoff has neither completedSteps nor pendingSteps.')
    }
    if (!run.userConfirmedDone && !userConfirmedDone) {
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

    this.store.markVerification(runId, verificationStatus)
    this.store.appendRunEvent(createRunEvent(runId, 'verify.finished', { verdict, reasons }))

    if (verificationStatus.resultVerified && verificationStatus.handoffVerified && (run.userConfirmedDone || userConfirmedDone)) {
      this.store.transitionRun(runId, 'done', 'completed')
      this.store.appendRunEvent(createRunEvent(runId, 'run.completed', { verdict }))
    }

    this.audit.info(runId, 'verify.result', 'Run verification completed.', { verdict, reasons })

    return { verdict, reasons, verificationStatus }
  }
}
