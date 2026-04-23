import { createSession, type AgentILSSessionState } from '../types/session.js'
import type {
  AgentILSTask,
  ControlMode,
  StateSnapshot,
  TaskInteraction,
  TaskInteractionResult,
  TaskPhase,
  TaskTerminal,
  TaskTimelineEntry,
} from '../types/index.js'

function nowIso() {
  return new Date().toISOString()
}

export class AgentGateMemoryStore {
  private session: AgentILSSessionState = createSession()
  private tasks = new Map<string, AgentILSTask>()

  ensureSession(sessionId?: string): AgentILSSessionState {
    if (sessionId && this.session.sessionId !== sessionId) {
      this.session = createSession()
    }
    return this.session
  }

  getSession(): AgentILSSessionState {
    return this.session
  }

  closeSession() {
    this.session = {
      ...this.session,
      status: 'closed',
      updatedAt: nowIso(),
    }
  }

  reopenSession() {
    if (this.session.status === 'active') {
      return
    }
    this.session = {
      ...this.session,
      status: 'active',
      updatedAt: nowIso(),
    }
  }

  listTasks(): AgentILSTask[] {
    return [...this.tasks.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  }

  getTask(taskId?: string | null): AgentILSTask | null {
    if (!taskId) {
      return null
    }
    return this.tasks.get(taskId) ?? null
  }

  getActiveTask(): AgentILSTask | null {
    return this.getTask(this.session.activeTaskId)
  }

  saveTask(task: AgentILSTask) {
    this.tasks.set(task.taskId, task)
    if (!this.session.taskIds.includes(task.taskId)) {
      this.session = {
        ...this.session,
        taskIds: [...this.session.taskIds, task.taskId],
        updatedAt: task.updatedAt,
      }
    }
  }

  setActiveTask(taskId: string | null) {
    this.session = {
      ...this.session,
      activeTaskId: taskId,
      updatedAt: nowIso(),
    }
  }

  updateTask(taskId: string, updater: (task: AgentILSTask) => AgentILSTask): AgentILSTask {
    const current = this.tasks.get(taskId)
    if (!current) {
      throw new Error(`Unknown task: ${taskId}`)
    }
    const next = updater(current)
    this.tasks.set(taskId, next)
    return next
  }

  transitionTask(taskId: string, params: {
    phase?: TaskPhase
    controlMode?: ControlMode
    terminal?: TaskTerminal
    pendingInteraction?: TaskInteraction | null
    planSummary?: string | null
    risks?: string[]
    executionResult?: string | null
    testResult?: string | null
    summary?: string | null
    reopenCount?: number
    collectedInputs?: string[]
    /** PR-B: 触发 controlMode 变化的来源（用于 controlModeHistory entry） */
    controlModeChangeReason?: string
    controlModeChangeTriggeredBy?: 'tcas' | 'user_input' | 'user_button' | 'system'
  }): AgentILSTask {
    return this.updateTask(taskId, (task) => {
      const now = nowIso()
      const nextControlMode = params.controlMode ?? task.controlMode
      // PR-B: ECAM 法则降级历程自动写入（只单向降级 normal→alternate→direct）
      const controlModeChanged = nextControlMode !== task.controlMode
      const nextHistory =
        controlModeChanged
          ? [
              ...task.controlModeHistory,
              {
                at: now,
                from: task.controlMode,
                to: nextControlMode,
                reason: params.controlModeChangeReason ?? `transition ${task.controlMode}→${nextControlMode}`,
                triggeredBy: params.controlModeChangeTriggeredBy ?? 'system',
              } as const,
            ]
          : task.controlModeHistory
      return {
        ...task,
        phase: params.phase ?? task.phase,
        controlMode: nextControlMode,
        terminal: params.terminal ?? task.terminal,
        pendingInteraction: params.pendingInteraction === undefined ? task.pendingInteraction : params.pendingInteraction,
        planSummary: params.planSummary === undefined ? task.planSummary : params.planSummary,
        risks: params.risks ?? task.risks,
        executionResult: params.executionResult === undefined ? task.executionResult : params.executionResult,
        testResult: params.testResult === undefined ? task.testResult : params.testResult,
        summary: params.summary === undefined ? task.summary : params.summary,
        reopenCount: params.reopenCount ?? task.reopenCount,
        collectedInputs: params.collectedInputs ?? task.collectedInputs,
        controlModeHistory: nextHistory,
        updatedAt: now,
      }
    })
  }

  appendTimeline(entry: Omit<TaskTimelineEntry, 'id' | 'timestamp'> & { id?: string; timestamp?: string }) {
    const next: TaskTimelineEntry = {
      id: entry.id ?? `event_${Math.random().toString(36).slice(2, 10)}`,
      timestamp: entry.timestamp ?? nowIso(),
      ...entry,
    }
    this.session = {
      ...this.session,
      timeline: [...this.session.timeline, next],
      updatedAt: next.timestamp,
    }
  }

  buildSnapshot(taskId?: string | null): StateSnapshot {
    const task = this.getTask(taskId ?? this.session.activeTaskId)
    return {
      session: {
        sessionId: this.session.sessionId,
        status: this.session.status,
        activeTaskId: this.session.activeTaskId,
        taskIds: [...this.session.taskIds],
        createdAt: this.session.createdAt,
        updatedAt: this.session.updatedAt,
      },
      task,
      tasks: this.listTasks(),
      timeline: [...this.session.timeline],
    }
  }

  bumpInteractionReopen(result: TaskInteractionResult) {
    const task = this.getActiveTask()
    if (!task?.pendingInteraction) {
      return null
    }
    if (task.pendingInteraction.interactionKey !== result.interactionKey) {
      return task
    }
    return this.transitionTask(task.taskId, {
      pendingInteraction: {
        ...task.pendingInteraction,
        requestId: `request_${Math.random().toString(36).slice(2, 10)}`,
        reopenCount: task.pendingInteraction.reopenCount + 1,
      },
      reopenCount: task.reopenCount + 1,
    })
  }
}
