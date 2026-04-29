import {
  createConversationRecord,
  type ConversationRecord,
  type ConversationState,
  type RunRecord,
  type RunEvent,
  type TaskSummaryDocument,
} from '../types/index.js'
import { normalizeControlMode, type ControlMode } from '../control/control-modes.js'
import { type OverrideState, isOverrideActive } from '../control/override-policy.js'

export interface ConversationStoreAdapter {
  listRuns(): RunRecord[]
  listRunEvents(runId: string): RunEvent[]
  resolveRunId(preferredRunId?: string | null): string | null
  getMeta(): { lastRunId: string | null; updatedAt: string }
  readTaskSummary(taskId: string): TaskSummaryDocument | null
}

export class AgentGateConversationStore {
  constructor(private readonly adapter: ConversationStoreAdapter) {}

  getRecord(preferredRunId?: string | null): ConversationRecord {
    const runs = this.adapter.listRuns()
    const resolvedRunId = this.adapter.resolveRunId(preferredRunId)
    const resolvedRun = resolvedRunId ? runs.find((run) => run.runId === resolvedRunId) ?? null : null
    const conversationId = resolvedRun?.conversationId ?? 'conversation_default'
    const completedTaskIds = runs
      .filter((run) => (run.conversationId ?? 'conversation_default') === conversationId)
      .filter((run) => run.currentStatus === 'completed')
      .map((run) => run.taskId)
    const archivedTaskSummaries = completedTaskIds
      .map((taskId) => this.adapter.readTaskSummary(taskId))
      .filter((summary): summary is TaskSummaryDocument => summary !== null)
    const state = this.deriveConversationState(resolvedRun)
    const activeTaskId = state === 'conversation_done' || state === 'await_next_task' ? null : resolvedRun?.taskId ?? null
    const createdAt =
      runs
        .filter((run) => (run.conversationId ?? 'conversation_default') === conversationId)
        .map((run) => run.createdAt)
        .sort()
        .at(0) ?? this.adapter.getMeta().updatedAt

    return createConversationRecord({
      conversationId,
      state,
      activeTaskId,
      completedTaskIds,
      archivedTaskSummaries,
      createdAt,
      updatedAt: this.adapter.getMeta().updatedAt,
    })
  }

  getConversationState(preferredRunId?: string | null): ConversationState {
    return this.getRecord(preferredRunId).state
  }

  isTaskActive(preferredRunId?: string | null): boolean {
    return this.getConversationState(preferredRunId) === 'active_task'
  }

  summarizeNextAction(run: RunRecord, overrideState?: OverrideState | null): string {
    const mode = normalizeControlMode(run.controlMode)
    const overrideSuffix = isOverrideActive(overrideState) ? 'override active' : 'no override'
    return `${mode} / ${overrideSuffix} / next: ${run.currentStep}`
  }

  private deriveConversationState(run: RunRecord | null): ConversationState {
    if (!run) {
      return 'await_next_task'
    }

    if (this.adapter.listRunEvents(run.runId).some((event) => event.type === 'conversation.completed')) {
      return 'conversation_done'
    }

    if (
      run.currentStatus === 'awaiting_user' ||
      run.currentStatus === 'awaiting_approval' ||
      run.currentStatus === 'budget_exceeded' ||
      run.currentStatus === 'failed'
    ) {
      return 'conversation_blocked'
    }

    if (run.currentStatus === 'completed' || run.currentStatus === 'cancelled') {
      return 'await_next_task'
    }

    return 'active_task'
  }
}
