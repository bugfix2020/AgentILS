import type { GateDecision } from '../control/gate-evaluators.js'
import type { ControlMode } from '../control/control-modes.js'
import type { OverrideState } from '../control/override-policy.js'
import type { AgentGateMemoryStore } from '../store/memory-store.js'
import { createRunEvent, type ConversationRecord, type TaskSummaryDocument } from '../types/index.js'
import type { TaskRecordView } from '../store/task-store.js'

function createBlockedDecision(reason: string, controlMode: ControlMode = 'normal'): GateDecision {
  return {
    allowed: false,
    reasons: [reason],
    controlMode,
  }
}

export interface ConversationSurfaceState {
  conversation: ConversationRecord
  activeTask: TaskRecordView | null
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
  getActiveTaskRecord(preferredRunId?: string | null): TaskRecordView | null
  listCompletedTaskIds(preferredRunId?: string | null): string[]
  listArchivedTaskSummaries(preferredRunId?: string | null): TaskSummaryDocument[]
  summarizeNextAction(preferredRunId?: string | null): string | null
  previewConversationStopGate(preferredRunId?: string | null, explicitConversationEnd?: boolean): GateDecision
  endConversation(preferredRunId?: string | null): ConversationRecord
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

  getActiveTaskRecord(preferredRunId?: string | null): TaskRecordView | null {
    if (!this.hasActiveTask(preferredRunId)) {
      return null
    }

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

  endConversation(preferredRunId?: string | null): ConversationRecord {
    const runId = this.resolveRunId(preferredRunId)
    if (!runId) {
      return this.getConversationRecord(preferredRunId)
    }

    const preview = this.previewConversationStopGate(runId, true)
    if (!preview.allowed) {
      throw new Error(preview.reasons.join(' '))
    }

    const conversation = this.getConversationRecord(runId)
    this.store.appendRunEvent(
      createRunEvent(runId, 'conversation.completed', {
        conversationId: conversation.conversationId,
      }),
    )
    return this.getConversationRecord(runId)
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
