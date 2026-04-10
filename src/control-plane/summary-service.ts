import type { AgentGateMemoryStore } from '../store/memory-store.js'
import type { TaskSummaryDocument, SummaryWriteInput } from '../store/summary-store.js'
import { normalizeControlMode, type ControlMode } from '../control/control-modes.js'
import type { OverrideState } from '../control/override-policy.js'

export interface TaskSummaryDraft {
  input: SummaryWriteInput
  document: TaskSummaryDocument
  path: string
}

export interface SummaryServiceApi {
  resolveSummaryPath(taskId: string): string
  readTaskSummary(taskId: string): TaskSummaryDocument | null
  createTaskSummaryDraft(
    preferredRunId?: string | null,
    overrides?: {
      outcome?: string
      body?: string
      title?: string
      controlMode?: ControlMode | string | null
      overrideState?: OverrideState | null
    },
  ): TaskSummaryDraft | null
  writeTaskSummary(input: SummaryWriteInput): TaskSummaryDocument
  writeTaskSummaryForRun(
    preferredRunId?: string | null,
    overrides?: {
      outcome?: string
      body?: string
      title?: string
      controlMode?: ControlMode | string | null
      overrideState?: OverrideState | null
    },
  ): TaskSummaryDocument | null
}

function createDefaultOutcome(status: string): string {
  switch (status) {
    case 'completed':
      return 'task completed'
    case 'cancelled':
      return 'task cancelled'
    case 'failed':
      return 'task failed'
    case 'budget_exceeded':
      return 'task blocked by budget'
    default:
      return `task ${status}`
  }
}

function createDefaultSummaryBody(input: {
  taskId: string
  runId: string
  title: string
  goal: string
  currentStep: string
  currentStatus: string
  scope: string[]
  touchedFiles: string[]
  risks: string[]
  verificationRequirements: string[]
  decisions: string[]
}): string {
  return [
    `# ${input.title}`,
    '',
    `- taskId: ${input.taskId}`,
    `- runId: ${input.runId}`,
    `- goal: ${input.goal}`,
    `- currentStep: ${input.currentStep}`,
    `- currentStatus: ${input.currentStatus}`,
    `- scope: ${input.scope.length > 0 ? input.scope.join(', ') : 'none'}`,
    `- touchedFiles: ${input.touchedFiles.length > 0 ? input.touchedFiles.join(', ') : 'none'}`,
    `- risks: ${input.risks.length > 0 ? input.risks.join(', ') : 'none'}`,
    `- verificationRequirements: ${
      input.verificationRequirements.length > 0 ? input.verificationRequirements.join(', ') : 'none'
    }`,
    `- decisions: ${input.decisions.length > 0 ? input.decisions.join(' | ') : 'none'}`,
  ].join('\n')
}

export class SummaryService implements SummaryServiceApi {
  constructor(private readonly store: AgentGateMemoryStore) {}

  resolveSummaryPath(taskId: string): string {
    return this.store.summaryStore.resolveSummaryPath(taskId)
  }

  readTaskSummary(taskId: string): TaskSummaryDocument | null {
    return this.store.readTaskSummary(taskId)
  }

  createTaskSummaryDraft(
    preferredRunId?: string | null,
    overrides: {
      outcome?: string
      body?: string
      title?: string
      controlMode?: ControlMode | string | null
      overrideState?: OverrideState | null
    } = {},
  ): TaskSummaryDraft | null {
    const runId = this.store.resolveRunId(preferredRunId)
    if (!runId) {
      return null
    }

    const task = this.store.requireRun(runId)
    const taskCard = this.store.requireTaskCard(runId)
    const path = this.resolveSummaryPath(task.taskId)
    const overrideState = overrides.overrideState ?? this.store.getCurrentOverrideState(runId)
    const now = new Date().toISOString()
    const input: SummaryWriteInput = {
      taskId: task.taskId,
      runId: task.runId,
      title: overrides.title ?? task.title,
      outcome: overrides.outcome ?? createDefaultOutcome(task.currentStatus),
      body:
        overrides.body ??
        createDefaultSummaryBody({
          taskId: task.taskId,
          runId: task.runId,
          title: task.title,
          goal: task.goal,
          currentStep: String(task.currentStep),
          currentStatus: String(task.currentStatus),
          scope: [...task.scope],
          touchedFiles: [...taskCard.touchedFiles],
          risks: [...task.risks],
          verificationRequirements: [...task.verificationRequirements],
          decisions: [...task.decisions],
        }),
      controlMode: overrides.controlMode ?? task.currentMode,
      overrideState,
    }

    return {
      input,
      document: {
        frontmatter: {
          taskId: input.taskId,
          runId: input.runId,
          title: input.title,
          outcome: input.outcome,
          controlMode: normalizeControlMode(input.controlMode ?? null),
          acceptedRisks: input.overrideState?.acceptedRisks ?? [],
          skippedChecks: input.overrideState?.skippedChecks ?? [],
          createdAt: now,
          updatedAt: now,
        },
        body: input.body,
      },
      path,
    }
  }

  writeTaskSummary(input: SummaryWriteInput): TaskSummaryDocument {
    return this.store.writeTaskSummary(input)
  }

  writeTaskSummaryForRun(
    preferredRunId?: string | null,
    overrides: {
      outcome?: string
      body?: string
      title?: string
      controlMode?: ControlMode | string | null
      overrideState?: OverrideState | null
    } = {},
  ): TaskSummaryDocument | null {
    const draft = this.createTaskSummaryDraft(preferredRunId, overrides)
    if (!draft) {
      return null
    }
    return this.store.writeTaskSummary(draft.input)
  }
}
