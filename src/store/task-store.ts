import { type HandoffPacket, type RunRecord, type TaskCard } from '../types/index.js'
import { normalizeControlMode, type ControlMode } from '../control/control-modes.js'
import { type OverrideState, isOverrideActive } from '../control/override-policy.js'

export interface TaskReadiness {
  technicallyReady: boolean
  boundaryApproved: boolean
  policyAllowed: boolean
  missingInfo: string[]
  risks: string[]
}

export interface TaskRecord {
  taskId: string
  runId: string
  title: string
  goal: string
  controlMode: ControlMode
  currentStep: string
  currentStatus: string
  openQuestions: string[]
  assumptions: string[]
  summaryDocumentPath: string | null
  overrideState: OverrideState | null
  executionReadiness: TaskReadiness
}

export interface TaskStoreAdapter {
  requireRun(runId: string): RunRecord
  requireTaskCard(runId: string): TaskCard
  requireHandoff(runId: string): HandoffPacket
}

export class AgentGateTaskStore {
  constructor(private readonly adapter: TaskStoreAdapter) {}

  getTaskRecord(runId: string, summaryDocumentPath: string | null = null, overrideState: OverrideState | null = null): TaskRecord {
    const run = this.adapter.requireRun(runId)
    const taskCard = this.adapter.requireTaskCard(runId)

    return {
      taskId: run.taskId,
      runId: run.runId,
      title: run.title,
      goal: run.goal,
      controlMode: normalizeControlMode(run.currentMode),
      currentStep: String(taskCard.currentStep),
      currentStatus: String(taskCard.currentStatus),
      openQuestions: [...taskCard.pendingItems],
      assumptions: [...taskCard.confirmedItems],
      summaryDocumentPath,
      overrideState,
      executionReadiness: {
        technicallyReady: taskCard.steps.length > 0 && Boolean(taskCard.goal.trim()),
        boundaryApproved: isOverrideActive(overrideState) || taskCard.scope.length > 0,
        policyAllowed: true,
        missingInfo: [],
        risks: [...taskCard.risks],
      },
    }
  }

  getTaskSummary(runId: string): Pick<TaskRecord, 'taskId' | 'title' | 'goal' | 'controlMode' | 'currentStep' | 'currentStatus'> {
    const run = this.adapter.requireRun(runId)
    const taskCard = this.adapter.requireTaskCard(runId)

    return {
      taskId: run.taskId,
      title: run.title,
      goal: run.goal,
      controlMode: normalizeControlMode(run.currentMode),
      currentStep: String(taskCard.currentStep),
      currentStatus: String(taskCard.currentStatus),
    }
  }
}
