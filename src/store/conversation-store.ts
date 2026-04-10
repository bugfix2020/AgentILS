import { type RunRecord } from '../types/index.js'
import { normalizeControlMode, type ControlMode } from '../control/control-modes.js'
import { type OverrideState, isOverrideActive } from '../control/override-policy.js'

export type ConversationState = 'active_task' | 'await_next_task' | 'conversation_blocked' | 'conversation_done'

export interface ConversationRecord {
  conversationId: string
  state: ConversationState
  activeTaskId: string | null
  completedTaskIds: string[]
  archivedTaskSummaries: string[]
}

export interface ConversationStoreAdapter {
  listRuns(): RunRecord[]
  resolveRunId(preferredRunId?: string | null): string | null
  getMeta(): { lastRunId: string | null; updatedAt: string }
}

export class AgentGateConversationStore {
  constructor(
    private readonly adapter: ConversationStoreAdapter,
    private readonly conversationId = 'conversation_default',
  ) {}

  getRecord(): ConversationRecord {
    const runs = this.adapter.listRuns()
    const resolvedRunId = this.adapter.resolveRunId()
    const resolvedRun = resolvedRunId ? runs.find((run) => run.runId === resolvedRunId) ?? null : null
    const completedTaskIds = runs
      .filter((run) => run.currentStatus === 'completed')
      .map((run) => run.taskId)
    const state = this.deriveConversationState(resolvedRun)
    const activeTaskId = state === 'active_task' ? resolvedRun?.taskId ?? null : null

    return {
      conversationId: this.conversationId,
      state,
      activeTaskId,
      completedTaskIds,
      archivedTaskSummaries: [],
    }
  }

  getConversationState(): ConversationState {
    return this.getRecord().state
  }

  isTaskActive(): boolean {
    return this.getConversationState() === 'active_task'
  }

  summarizeNextAction(run: RunRecord, overrideState?: OverrideState | null): string {
    const mode = normalizeControlMode(run.currentMode)
    const overrideSuffix = isOverrideActive(overrideState) ? 'override active' : 'no override'
    return `${mode} / ${overrideSuffix} / next: ${run.currentStep}`
  }

  private deriveConversationState(run: RunRecord | null): ConversationState {
    if (!run) {
      return 'await_next_task'
    }

    if (run.currentStatus === 'budget_exceeded' || run.currentStatus === 'failed') {
      return 'conversation_blocked'
    }

    if (run.currentStatus === 'completed' || run.currentStatus === 'cancelled') {
      return 'await_next_task'
    }

    return 'active_task'
  }
}
