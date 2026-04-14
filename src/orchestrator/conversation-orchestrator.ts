import { randomUUID } from 'node:crypto'
import { AgentGateAuditLogger } from '../audit/audit-logger.js'
import { AgentGateMemoryStore } from '../store/memory-store.js'
import {
  createConversationRecord,
  createRunEvent,
  type ConversationRecord,
  type RunRecord,
  type StartRunInput,
  type TaskSummaryDocument,
} from '../types/index.js'
import { AgentGateTaskOrchestrator } from './task-orchestrator.js'

export interface ConversationContext {
  conversationRecord: ConversationRecord
  activeRun: RunRecord | null
  latestSummaryDocument: TaskSummaryDocument | null
}

export class AgentGateConversationOrchestrator {
  constructor(
    private readonly store: AgentGateMemoryStore,
    private readonly audit: AgentGateAuditLogger,
    private readonly task: AgentGateTaskOrchestrator,
  ) {}

  resolveConversationId(preferredConversationId?: string | null): string {
    if (preferredConversationId?.trim()) {
      return preferredConversationId.trim()
    }

    const resolvedRunId = this.store.resolveRunId()
    if (resolvedRunId) {
      const currentRun = this.store.requireRun(resolvedRunId)
      if (currentRun.conversationId?.trim()) {
        return currentRun.conversationId
      }
    }

    return `conversation_${randomUUID()}`
  }

  startRun(input: StartRunInput): RunRecord {
    const conversationId = this.resolveConversationId(input.conversationId ?? null)
    const run = this.store.startRun({
      ...input,
      conversationId,
    })

    this.task.ensureSummaryDocumentPath(run.runId)
    this.task.setTaskControlMode(run.runId, this.store.requireTaskCard(run.runId).controlMode, 'conversation.start')
    this.audit.info(run.runId, 'conversation.start', 'Conversation task started.', {
      conversationId,
      taskId: run.taskId,
    })
    return this.store.requireRun(run.runId)
  }

  getConversationRecord(preferredRunId?: string | null): ConversationRecord {
    const conversationContext = this.getConversationContext(preferredRunId)
    return conversationContext.conversationRecord
  }

  getConversationContext(preferredRunId?: string | null): ConversationContext {
    const runId = this.store.resolveRunId(preferredRunId)
    if (!runId) {
      const conversationRecord = this.store.getConversationRecord(preferredRunId)
      return {
        conversationRecord,
        activeRun: null,
        latestSummaryDocument: null,
      }
    }

    const latestRun = this.store.requireRun(runId)
    const runs = this.store.listRuns()
    const conversationId = latestRun.conversationId ?? 'conversation_default'
    const scopedRuns = runs.filter((run) => (run.conversationId ?? 'conversation_default') === conversationId)
    const completedRuns = scopedRuns.filter((run) => run.currentStatus === 'completed')
    const completedTaskIds = completedRuns.map((run) => run.taskId)
    const latestCompletedRun = [...completedRuns].pop() ?? null
    const latestSummaryDocument = latestCompletedRun ? this.store.readTaskSummary(latestCompletedRun.taskId) : null

    const conversationRecord = createConversationRecord({
      ...this.store.getConversationRecord(runId),
      completedTaskIds,
      archivedTaskSummaries: latestSummaryDocument ? [latestSummaryDocument] : [],
      createdAt: scopedRuns.map((run) => run.createdAt).sort().at(0) ?? latestRun.createdAt,
      updatedAt: latestRun.updatedAt,
    })

    return {
      conversationRecord,
      activeRun: conversationRecord.activeTaskId ? latestRun : null,
      latestSummaryDocument,
    }
  }

  getLatestSummaryDocument(preferredRunId?: string | null): TaskSummaryDocument | null {
    return this.getConversationContext(preferredRunId).latestSummaryDocument
  }

  endConversation(preferredRunId?: string | null): ConversationRecord {
    const runId = this.store.resolveRunId(preferredRunId)
    if (!runId) {
      return this.getConversationRecord(preferredRunId)
    }

    const conversationRecord = this.getConversationRecord(runId)
    if (conversationRecord.activeTaskId) {
      throw new Error('Cannot end conversation while a task is still active.')
    }

    this.store.appendRunEvent(
      createRunEvent(runId, 'conversation.completed', {
        conversationId: conversationRecord.conversationId,
      }),
    )
    this.audit.info(runId, 'conversation.end', 'Conversation explicitly ended.', {
      conversationId: conversationRecord.conversationId,
    })
    return this.getConversationRecord(runId)
  }
}
