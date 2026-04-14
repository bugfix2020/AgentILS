import { AgentGateOrchestrator } from '../orchestrator/orchestrator.js'
import { normalizeControlMode } from '../control/control-modes.js'
import { createOverrideState } from '../control/override-policy.js'
import { AgentGateMemoryStore } from '../store/memory-store.js'
import { ConversationService } from './conversation-service.js'
import { OverrideService } from './override-service.js'
import { SummaryService } from './summary-service.js'
import { TaskService } from './task-service.js'
import { type StartRunInput, type RunStatus, type RunStep } from '../types/index.js'
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

export interface EndConversationInput extends UiRuntimeOptions {}

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

type UiActionServices = ReturnType<typeof createServices>

function mapSummary(document: TaskSummaryDocument | null, filePath: string | null): UiTaskSummaryDocument | null {
  if (!document) {
    return null
  }

  return {
    taskId: document.frontmatter.taskId,
    title: document.frontmatter.taskTitle,
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

function buildUiTaskSnapshotFromRunId(
  services: UiActionServices,
  runId: string,
  summaryOverride?: TaskSummaryDocument | null,
): UiTaskSnapshot | null {
  const envelope = services.task.getTaskEnvelope(runId)
  if (!envelope) {
    return null
  }
  const { run, taskCard } = envelope
  const summary = summaryOverride ?? services.store.readTaskSummary(run.taskId)

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
      openQuestions: [...taskCard.openQuestions],
      assumptions: [...taskCard.assumptions],
      decisionNeededFromUser: [...taskCard.decisionNeededFromUser],
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
}

function buildRuntimeSnapshotInternal(options: UiRuntimeOptions = {}): UiRuntimeSnapshot {
  const services = createServices(options.stateFilePath)
  const conversationSurface = services.conversation.buildConversationSurface(options.preferredRunId)
  const taskHistory = services.store
    .listRuns()
    .map((run) => buildUiTaskSnapshotFromRunId(services, run.runId))
    .filter((task): task is UiTaskSnapshot => task !== null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))

  const activeSummary = conversationSurface.activeTask
    ? services.store.readTaskSummary(conversationSurface.activeTask.taskId)
    : null
  const latestSummary = activeSummary ?? conversationSurface.archivedTaskSummaries.at(-1) ?? null

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
      createdAt: conversationSurface.conversation.createdAt,
      updatedAt: conversationSurface.conversation.updatedAt,
    },
    activeTask: conversationSurface.activeTask
      ? buildUiTaskSnapshotFromRunId(services, conversationSurface.activeTask.runId, activeSummary)
      : null,
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
  const run = services.task.startTask(input)
  return buildRuntimeSnapshotInternal({
    stateFilePath: input.stateFilePath,
    preferredRunId: run.runId,
  })
}

export function continueUiTask(input: ContinueTaskInput = {}): UiRuntimeSnapshot {
  const services = createServices(input.stateFilePath)
  const runId = services.task.resolveRunId(input.preferredRunId)
  if (!runId) {
    return buildRuntimeSnapshotInternal(input)
  }

  const run = services.task.getRun(runId)
  if (!run) {
    return buildRuntimeSnapshotInternal(input)
  }
  const nextStep = resolveNextStep(String(run.currentStep))

  if (input.note?.trim()) {
    services.task.appendDecision(runId, input.note.trim())
  }

  services.task.transitionTask(runId, nextStep, resolveStatusForStep(nextStep))
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

  const envelope = services.task.getTaskEnvelope(runId)
  if (!envelope) {
    return buildRuntimeSnapshotInternal(input)
  }
  const { run, taskCard } = envelope
  const overrideState = createOverrideState({
    taskId: run.taskId,
    conversationId: run.conversationId ?? null,
    level: input.level ?? 'soft',
    summary: input.acknowledgement,
    acceptedRisks: [...run.risks],
    skippedChecks: [],
    mode: taskCard.controlMode,
  })
  services.orchestrator.task.setTaskOverrideState(runId, overrideState)
  services.orchestrator.controlMode.applyControlModeSignal(
    runId,
    normalizeControlMode(taskCard.controlMode) === 'normal' ? 'override' : 'repeat_override',
    overrideState,
    'ui.override',
  )
  services.task.appendDecision(runId, `override: ${input.acknowledgement}`)

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

  const taskCard = services.task.getTaskCard(runId)
  if (!taskCard) {
    return buildRuntimeSnapshotInternal(input)
  }

  if (input.summary?.trim()) {
    services.task.appendDecision(runId, `summary: ${input.summary.trim()}`)
  }

  services.orchestrator.controlMode.recordFeedback(runId, {
    status: 'done',
    msg:
      input.summary?.trim() ??
      (normalizeControlMode(taskCard.controlMode) === 'direct' || Boolean(taskCard.overrideState?.confirmed)
        ? 'Marked done from AgentILS VS Code task console under override/direct mode.'
        : 'Marked done from AgentILS VS Code task console.'),
  })
  services.orchestrator.verifyRun(runId, true)

  return buildRuntimeSnapshotInternal({
    stateFilePath: input.stateFilePath,
    preferredRunId: runId,
  })
}

export function endUiConversation(input: EndConversationInput = {}): UiRuntimeSnapshot {
  const services = createServices(input.stateFilePath)
  try {
    services.conversation.endConversation(input.preferredRunId)
  } catch {
    return buildRuntimeSnapshotInternal(input)
  }

  return buildRuntimeSnapshotInternal({
    stateFilePath: input.stateFilePath,
    preferredRunId: input.preferredRunId,
  })
}
