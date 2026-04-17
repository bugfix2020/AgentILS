import { AgentGateAuditLogger } from '../audit/audit-logger.js'
import { evaluateBudget } from '../budget/budget-checker.js'
import { evaluateToolPolicy, type PolicyContext } from '../policy/tool-policy-checker.js'
import { AgentGateMemoryStore } from '../store/memory-store.js'
import {
  type ApprovalResult,
  type FeedbackDecision,
  type HandoffPacket,
  type RunBudgetUsageDelta,
  type StartRunInput,
  type TaskCard,
  type ConversationRecord,
} from '../types/index.js'
import { AgentGateConversationOrchestrator } from './conversation-orchestrator.js'
import {
  AgentGateControlModeOrchestrator,
  type ApprovalRequestContext,
  type BeginApprovalRequestInput,
} from './control-mode-orchestrator.js'
import { AgentGateTaskOrchestrator } from './task-orchestrator.js'
import {
  type VerifyRunResult,
  type VerificationRequestContext,
  AgentGateVerificationOrchestrator,
} from './verification-orchestrator.js'

export interface AgentGateOrchestratorRuntime {
  conversation: AgentGateConversationOrchestrator
  controlMode: AgentGateControlModeOrchestrator
  task: AgentGateTaskOrchestrator
  verification: AgentGateVerificationOrchestrator
}

export class AgentGateOrchestrator {
  readonly audit: AgentGateAuditLogger
  readonly conversation: AgentGateConversationOrchestrator
  readonly controlMode: AgentGateControlModeOrchestrator
  readonly task: AgentGateTaskOrchestrator
  readonly verification: AgentGateVerificationOrchestrator

  constructor(readonly store: AgentGateMemoryStore) {
    this.audit = new AgentGateAuditLogger(store)
    this.task = new AgentGateTaskOrchestrator(store, this.audit)
    this.conversation = new AgentGateConversationOrchestrator(store, this.audit, this.task)
    this.controlMode = new AgentGateControlModeOrchestrator(store, this.audit, this.task)
    this.verification = new AgentGateVerificationOrchestrator(
      store,
      this.audit,
      this.task,
      this.conversation,
    )
  }

  startRun(input: StartRunInput) {
    return this.conversation.startRun(input)
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
    return this.task.upsertTaskCard(taskCard)
  }

  upsertHandoff(handoff: HandoffPacket) {
    return this.task.upsertHandoff(handoff)
  }

  beginApprovalRequest(ctx: ApprovalRequestContext, input: BeginApprovalRequestInput) {
    return this.controlMode.beginApprovalRequest(ctx, input)
  }

  recordApproval(
    runId: string,
    summary: string,
    result: ApprovalResult,
    ctx?: Pick<ApprovalRequestContext, 'now' | 'traceId'>,
  ) {
    return this.controlMode.recordApproval(runId, summary, result, ctx)
  }

  recordFeedback(runId: string, decision: FeedbackDecision, ctx?: Pick<ApprovalRequestContext, 'traceId'>) {
    return this.controlMode.recordFeedback(runId, decision, ctx)
  }

  verifyRun(runId: string, userConfirmedDone = false, ctx?: VerificationRequestContext): VerifyRunResult {
    return this.verification.verifyRun(runId, userConfirmedDone, ctx)
  }

  getConversationRecord(preferredRunId?: string | null): ConversationRecord {
    return this.conversation.getConversationRecord(preferredRunId)
  }

  endConversation(preferredRunId?: string | null) {
    return this.conversation.endConversation(preferredRunId)
  }

  getConversationContext(preferredRunId?: string | null) {
    return this.conversation.getConversationContext(preferredRunId)
  }

  getLatestSummaryDocument(preferredRunId?: string | null) {
    return this.conversation.getLatestSummaryDocument(preferredRunId)
  }

  getTaskRecord(runId: string, summaryDocumentPath: string | null = null) {
    return this.store.getTaskRecord(runId, summaryDocumentPath)
  }

  getTaskSummary(runId: string) {
    return this.store.getTaskSummary(runId)
  }
}
