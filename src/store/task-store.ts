import { type HandoffPacket, type RunRecord, type TaskCard, type TaskExecutionReadiness } from '../types/index.js'
import { normalizeControlMode, type ControlMode } from '../control/control-modes.js'
import { type OverrideState, isOverrideActive } from '../control/override-policy.js'

export type TaskReadiness = TaskExecutionReadiness

export interface TaskRecordView {
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

  getTaskRecord(
    runId: string,
    summaryDocumentPath: string | null = null,
    overrideState: OverrideState | null = null,
  ): TaskRecordView {
    const run = this.adapter.requireRun(runId)
    const taskCard = this.adapter.requireTaskCard(runId)
    const boundaryApproved = taskCard.executionReadiness.boundaryApproved || isOverrideActive(overrideState)

    return {
      taskId: run.taskId,
      runId: run.runId,
      title: run.title,
      goal: run.goal,
      controlMode: normalizeControlMode(taskCard.controlMode),
      currentStep: String(taskCard.currentStep),
      currentStatus: String(taskCard.currentStatus),
      openQuestions: [...taskCard.openQuestions],
      assumptions: [...taskCard.assumptions],
      summaryDocumentPath,
      overrideState,
      executionReadiness: {
        technicallyReady: taskCard.executionReadiness.technicallyReady || (taskCard.steps.length > 0 && Boolean(taskCard.goal.trim())),
        boundaryApproved,
        policyAllowed: taskCard.executionReadiness.policyAllowed,
        missingInfo: [...taskCard.executionReadiness.missingInfo],
        risks: [...taskCard.executionReadiness.risks],
      },
    }
  }

  getTaskSummary(runId: string): Pick<TaskRecordView, 'taskId' | 'title' | 'goal' | 'controlMode' | 'currentStep' | 'currentStatus'> {
    const run = this.adapter.requireRun(runId)
    const taskCard = this.adapter.requireTaskCard(runId)

    return {
      taskId: run.taskId,
      title: run.title,
      goal: run.goal,
      controlMode: normalizeControlMode(taskCard.controlMode),
      currentStep: String(taskCard.currentStep),
      currentStatus: String(taskCard.currentStatus),
    }
  }
}
