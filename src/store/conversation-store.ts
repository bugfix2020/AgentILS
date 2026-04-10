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
    const activeRunId = this.adapter.resolveRunId()
    const runs = this.adapter.listRuns()
    const completedTaskIds = runs
      .filter((run) => run.currentStatus === 'completed')
      .map((run) => run.taskId)

    return {
      conversationId: this.conversationId,
      state: activeRunId ? 'active_task' : 'await_next_task',
      activeTaskId: activeRunId,
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
}

