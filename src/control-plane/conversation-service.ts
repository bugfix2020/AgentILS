import type { GateDecision } from '../control/gate-evaluators.js'
import type { ControlMode } from '../control/control-modes.js'
import type { OverrideState } from '../control/override-policy.js'
import type { AgentGateMemoryStore } from '../store/memory-store.js'
import type { ConversationRecord } from '../store/conversation-store.js'
import type { TaskRecord } from '../store/task-store.js'
import type { TaskSummaryDocument } from '../store/summary-store.js'

function createBlockedDecision(reason: string, controlMode: ControlMode = 'normal'): GateDecision {
  return {
    allowed: false,
    reasons: [reason],
    controlMode,
  }
}

export interface ConversationSurfaceState {
  conversation: ConversationRecord
  activeTask: TaskRecord | null
  archivedTaskSummaries: TaskSummaryDocument[]
  controlMode: ControlMode
  overrideState: OverrideState | null
  nextAction: string | null
  conversationStopGate: GateDecision
}

export interface ConversationServiceApi {
  resolveRunId(preferredRunId?: string | null): string | null
  getConversationRecord(preferredRunId?: string | null): ConversationRecord
  getConversationState(preferredRunId?: string | null): ConversationRecord['state']
  hasActiveTask(preferredRunId?: string | null): boolean
  getActiveTaskRecord(preferredRunId?: string | null): TaskRecord | null
  listCompletedTaskIds(preferredRunId?: string | null): string[]
  listArchivedTaskSummaries(preferredRunId?: string | null): TaskSummaryDocument[]
  summarizeNextAction(preferredRunId?: string | null): string | null
  previewConversationStopGate(preferredRunId?: string | null, explicitConversationEnd?: boolean): GateDecision
  buildConversationSurface(preferredRunId?: string | null, explicitConversationEnd?: boolean): ConversationSurfaceState
}

export class ConversationService implements ConversationServiceApi {
  constructor(private readonly store: AgentGateMemoryStore) {}

  resolveRunId(preferredRunId?: string | null): string | null {
    return this.store.resolveRunId(preferredRunId)
  }

  getConversationRecord(preferredRunId?: string | null): ConversationRecord {
    void preferredRunId
    return this.store.getConversationRecord()
  }

  getConversationState(preferredRunId?: string | null): ConversationRecord['state'] {
    return this.getConversationRecord(preferredRunId).state
  }

  hasActiveTask(preferredRunId?: string | null): boolean {
    return this.getConversationState(preferredRunId) === 'active_task'
  }

  getActiveTaskRecord(preferredRunId?: string | null): TaskRecord | null {
    const runId = this.resolveRunId(preferredRunId)
    if (!runId) {
      return null
    }

    try {
      return this.store.getTaskRecord(runId)
    } catch {
      return null
    }
  }

  listCompletedTaskIds(preferredRunId?: string | null): string[] {
    const conversation = this.getConversationRecord(preferredRunId)
    return [...conversation.completedTaskIds]
  }

  listArchivedTaskSummaries(preferredRunId?: string | null): TaskSummaryDocument[] {
    return this.listCompletedTaskIds(preferredRunId)
      .map((taskId) => this.store.readTaskSummary(taskId))
      .filter((summary): summary is TaskSummaryDocument => summary !== null)
  }

  summarizeNextAction(preferredRunId?: string | null): string | null {
    const runId = this.resolveRunId(preferredRunId)
    if (!runId) {
      return null
    }

    try {
      const run = this.store.requireRun(runId)
      const overrideState = this.store.getCurrentOverrideState(runId)
      return this.store.conversationStore.summarizeNextAction(run, overrideState)
    } catch {
      return null
    }
  }

  previewConversationStopGate(preferredRunId?: string | null, explicitConversationEnd = false): GateDecision {
    const runId = this.resolveRunId(preferredRunId)
    if (!runId) {
      return createBlockedDecision('No active run is available for conversation stop preview.')
    }

    try {
      return this.store.previewConversationStopGate(runId, explicitConversationEnd)
    } catch {
      return createBlockedDecision(`Unknown runId: ${runId}`)
    }
  }

  buildConversationSurface(
    preferredRunId?: string | null,
    explicitConversationEnd = false,
  ): ConversationSurfaceState {
    const conversation = this.getConversationRecord(preferredRunId)
    const activeTask = this.getActiveTaskRecord(preferredRunId)
    const archivedTaskSummaries = this.listArchivedTaskSummaries(preferredRunId)
    const runId = this.resolveRunId(preferredRunId)
    const overrideState = activeTask?.overrideState ?? (runId ? this.store.getCurrentOverrideState(runId) : null)
    const controlMode = activeTask?.controlMode ?? overrideState?.mode ?? 'normal'
    const nextAction = this.summarizeNextAction(preferredRunId)

    return {
      conversation,
      activeTask,
      archivedTaskSummaries,
      controlMode,
      overrideState,
      nextAction,
      conversationStopGate: this.previewConversationStopGate(preferredRunId, explicitConversationEnd),
    }
  }
}
