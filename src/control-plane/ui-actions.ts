import { AgentGateOrchestrator } from '../orchestrator/orchestrator.js'
import { normalizeControlMode } from '../control/control-modes.js'
import { AgentGateMemoryStore } from '../store/memory-store.js'
import { ConversationService } from './conversation-service.js'
import { OverrideService } from './override-service.js'
import { SummaryService } from './summary-service.js'
import { TaskService } from './task-service.js'
import { createOverrideState, type StartRunInput, type RunStatus, type RunStep } from '../types/index.js'
import { renderTaskSummaryDocument, type TaskSummaryDocument } from '../store/summary-store.js'

export interface UiConversationSnapshot {
  conversationId: string
  state: string
  taskIds: string[]
  activeTaskId: string | null
  lastSummaryTaskId: string | null
  createdAt: string | null
  updatedAt: string | null
}

export interface UiTaskSummaryDocument {
  taskId: string
  title: string
  filePath: string
  markdown: string
  generatedAt: string
  updatedAt: string
  userEdited: boolean
}

export interface UiTaskSnapshot {
  taskId: string
  runId: string
  title: string
  goal: string
  controlMode: string
  phase: string
  status: string
  scope: string[]
  constraints: string[]
  risks: string[]
  openQuestions: string[]
  assumptions: string[]
  decisionNeededFromUser: string[]
  notes: string[]
  overrideState: {
    confirmed: boolean
    acknowledgedAt: string | null
    note: string | null
  }
  summaryDocument: UiTaskSummaryDocument | null
  createdAt: string
  updatedAt: string
}

export interface UiRuntimeSnapshot {
  conversation: UiConversationSnapshot
  activeTask: UiTaskSnapshot | null
  taskHistory: UiTaskSnapshot[]
  latestSummary: UiTaskSummaryDocument | null
}

export interface UiRuntimeOptions {
  stateFilePath?: string | null
  preferredRunId?: string | null
}

export interface ContinueTaskInput extends UiRuntimeOptions {
  note?: string
}

export interface AcceptOverrideInput extends UiRuntimeOptions {
  acknowledgement: string
  level?: 'soft' | 'hard'
}

export interface MarkTaskDoneInput extends UiRuntimeOptions {
  summary?: string
}

const runProgression: RunStep[] = [
  'collect',
  'confirm_elements',
  'plan',
  'approval',
  'execute',
  'handoff_prepare',
  'verify',
  'done',
]

function createServices(stateFilePath?: string | null) {
  const store = new AgentGateMemoryStore(stateFilePath ?? undefined)
  const orchestrator = new AgentGateOrchestrator(store)

  return {
    store,
    orchestrator,
    conversation: new ConversationService(store),
    task: new TaskService(store),
    summary: new SummaryService(store),
    override: new OverrideService(store),
  }
}

function mapSummary(document: TaskSummaryDocument | null, filePath: string | null): UiTaskSummaryDocument | null {
  if (!document) {
    return null
  }

  return {
    taskId: document.frontmatter.taskId,
    title: document.frontmatter.title,
    filePath: filePath ?? '',
    markdown: renderTaskSummaryDocument(document),
    generatedAt: document.frontmatter.createdAt,
    updatedAt: document.frontmatter.updatedAt,
    userEdited: false,
  }
}

function mapTask(
  input: {
    runId: string
    taskId: string
    title: string
    goal: string
    controlMode: string
    phase: string
    status: string
    scope: string[]
    constraints: string[]
    risks: string[]
    openQuestions: string[]
    assumptions: string[]
    decisionNeededFromUser: string[]
    notes: string[]
    overrideState: {
      confirmed: boolean
      acknowledgedAt: string | null
      note: string | null
    }
    createdAt: string
    updatedAt: string
  } | null,
  summary: TaskSummaryDocument | null,
  summaryPath: string | null,
): UiTaskSnapshot | null {
  if (!input) {
    return null
  }

  return {
    taskId: input.taskId,
    runId: input.runId,
    title: input.title,
    goal: input.goal,
    controlMode: normalizeControlMode(input.controlMode),
    phase: input.phase,
    status: input.status,
    scope: [...input.scope],
    constraints: [...input.constraints],
    risks: [...input.risks],
    openQuestions: [...input.openQuestions],
    assumptions: [...input.assumptions],
    decisionNeededFromUser: [...input.decisionNeededFromUser],
    notes: [...input.notes],
    overrideState: input.overrideState,
    summaryDocument: mapSummary(summary, summaryPath),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  }
}

function buildRuntimeSnapshotInternal(options: UiRuntimeOptions = {}): UiRuntimeSnapshot {
  const services = createServices(options.stateFilePath)
  const conversationSurface = services.conversation.buildConversationSurface(options.preferredRunId)
  const taskHistory = services.store
    .listRuns()
    .map((run) => {
      const taskCard = services.store.requireTaskCard(run.runId)
      const summary = services.store.readTaskSummary(run.taskId)
      return mapTask(
        {
          runId: run.runId,
          taskId: run.taskId,
          title: run.title,
          goal: run.goal,
          controlMode: taskCard.controlMode,
          phase: String(taskCard.currentStep),
          status: String(taskCard.currentStatus),
          scope: [...run.scope],
          constraints: [...run.constraints],
          risks: [...run.risks],
          openQuestions: [...taskCard.pendingItems],
          assumptions: [...taskCard.confirmedItems],
          decisionNeededFromUser: [],
          notes: [...run.decisions],
          overrideState: {
            confirmed: Boolean(taskCard.overrideState?.confirmed),
            acknowledgedAt: taskCard.overrideState?.confirmedAt ?? null,
            note: taskCard.overrideState?.summary ?? null,
          },
          createdAt: run.createdAt,
          updatedAt: run.updatedAt,
        },
        summary,
        taskCard.summaryDocumentPath,
      )
    })
    .filter((task): task is UiTaskSnapshot => task !== null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))

  const activeSummary = conversationSurface.activeTask
    ? services.store.readTaskSummary(conversationSurface.activeTask.taskId)
    : null
  const latestSummary = activeSummary ?? conversationSurface.archivedTaskSummaries.at(-1) ?? null
  const activeTaskCard = conversationSurface.activeTask
    ? services.store.requireTaskCard(conversationSurface.activeTask.runId)
    : null

  return {
    conversation: {
      conversationId: conversationSurface.conversation.conversationId,
      state: conversationSurface.conversation.state,
      taskIds: taskHistory.map((task) => task.taskId),
      activeTaskId: conversationSurface.conversation.activeTaskId,
      lastSummaryTaskId: mapSummary(
        latestSummary,
        latestSummary ? services.summary.resolveSummaryPath(latestSummary.frontmatter.taskId) : null,
      )?.taskId ?? null,
      createdAt: services.store.getMeta().updatedAt,
      updatedAt: services.store.getMeta().updatedAt,
    },
    activeTask: mapTask(
      conversationSurface.activeTask
        ? {
            runId: conversationSurface.activeTask.runId,
            taskId: conversationSurface.activeTask.taskId,
            title: conversationSurface.activeTask.title,
            goal: conversationSurface.activeTask.goal,
            controlMode: conversationSurface.activeTask.controlMode,
            phase: conversationSurface.activeTask.currentStep,
            status: conversationSurface.activeTask.currentStatus,
            scope: services.store.requireRun(conversationSurface.activeTask.runId).scope,
            constraints: services.store.requireRun(conversationSurface.activeTask.runId).constraints,
            risks: services.store.requireRun(conversationSurface.activeTask.runId).risks,
            openQuestions: [...(activeTaskCard?.pendingItems ?? [])],
            assumptions: [...(activeTaskCard?.confirmedItems ?? [])],
            decisionNeededFromUser: [],
            notes: [...services.store.requireRun(conversationSurface.activeTask.runId).decisions],
            overrideState: {
              confirmed: Boolean(conversationSurface.activeTask.overrideState?.confirmed),
              acknowledgedAt: conversationSurface.activeTask.overrideState?.confirmedAt ?? null,
              note: conversationSurface.activeTask.overrideState?.summary ?? null,
            },
            createdAt: services.store.requireRun(conversationSurface.activeTask.runId).createdAt,
            updatedAt: services.store.requireRun(conversationSurface.activeTask.runId).updatedAt,
          }
        : null,
      activeSummary,
      activeTaskCard?.summaryDocumentPath ?? null,
    ),
    taskHistory,
    latestSummary: mapSummary(
      latestSummary,
      latestSummary ? services.summary.resolveSummaryPath(latestSummary.frontmatter.taskId) : null,
    ),
  }
}

function resolveNextStep(currentStep: string): RunStep {
  const index = runProgression.indexOf(currentStep as RunStep)
  if (index < 0) {
    return 'confirm_elements'
  }
  return runProgression[Math.min(index + 1, runProgression.length - 1)]
}

function resolveStatusForStep(step: RunStep): RunStatus {
  if (step === 'approval') {
    return 'awaiting_approval'
  }
  if (step === 'done') {
    return 'completed'
  }
  return 'active'
}

export function buildUiRuntimeSnapshot(options: UiRuntimeOptions = {}): UiRuntimeSnapshot {
  return buildRuntimeSnapshotInternal(options)
}

export function startUiTask(input: StartRunInput & UiRuntimeOptions): UiRuntimeSnapshot {
  const services = createServices(input.stateFilePath)
  services.task.startTask(input)
  return buildRuntimeSnapshotInternal({
    stateFilePath: input.stateFilePath,
    preferredRunId: services.store.getMeta().lastRunId,
  })
}

export function continueUiTask(input: ContinueTaskInput = {}): UiRuntimeSnapshot {
  const services = createServices(input.stateFilePath)
  const runId = services.task.resolveRunId(input.preferredRunId)
  if (!runId) {
    return buildRuntimeSnapshotInternal(input)
  }

  const run = services.store.requireRun(runId)
  const nextStep = resolveNextStep(String(run.currentStep))

  if (input.note?.trim()) {
    services.store.appendDecision(runId, input.note.trim())
  }

  services.orchestrator.task.transitionTask(runId, nextStep, resolveStatusForStep(nextStep))
  return buildRuntimeSnapshotInternal({
    stateFilePath: input.stateFilePath,
    preferredRunId: runId,
  })
}

export function acceptUiOverride(input: AcceptOverrideInput): UiRuntimeSnapshot {
  const services = createServices(input.stateFilePath)
  const runId = services.override.resolveRunId(input.preferredRunId)
  if (!runId) {
    return buildRuntimeSnapshotInternal(input)
  }

  const run = services.store.requireRun(runId)
  const taskCard = services.store.requireTaskCard(runId)
  const overrideState = createOverrideState({
    taskId: run.taskId,
        conversationId: run.conversationId ?? null,
        level: input.level ?? 'soft',
        summary: input.acknowledgement,
        acceptedRisks: [...run.risks],
        skippedChecks: [],
        mode: taskCard.controlMode,
  })

  services.store.patchTaskCard(runId, {
    overrideState,
    controlMode: 'direct',
  })
  services.store.appendDecision(runId, `override: ${input.acknowledgement}`)

  return buildRuntimeSnapshotInternal({
    stateFilePath: input.stateFilePath,
    preferredRunId: runId,
  })
}

export function markUiTaskDone(input: MarkTaskDoneInput = {}): UiRuntimeSnapshot {
  const services = createServices(input.stateFilePath)
  const runId = services.task.resolveRunId(input.preferredRunId)
  if (!runId) {
    return buildRuntimeSnapshotInternal(input)
  }

  const run = services.store.requireRun(runId)
  const taskCard = services.store.requireTaskCard(runId)
  const allowDirectCompletion = normalizeControlMode(taskCard.controlMode) === 'direct' || Boolean(taskCard.overrideState?.confirmed)

  if (input.summary?.trim()) {
    services.store.appendDecision(runId, `summary: ${input.summary.trim()}`)
  }

  if (allowDirectCompletion) {
    services.store.confirmDone(runId, true)
    services.store.transitionRun(runId, 'done', 'completed')
    services.orchestrator.task.ensureSummaryDocumentPath(runId)
    services.summary.writeTaskSummaryForRun(runId, {
      outcome: 'task completed via direct control mode',
      body: input.summary?.trim(),
    })
  } else {
    services.orchestrator.controlMode.recordFeedback(runId, {
      status: 'done',
      msg: input.summary?.trim() ?? 'Marked done from AgentILS VS Code task console.',
    })
    services.orchestrator.verifyRun(runId, true)
  }

  return buildRuntimeSnapshotInternal({
    stateFilePath: input.stateFilePath,
    preferredRunId: runId,
  })
}
