import { randomUUID } from 'node:crypto'
import { AgentGateOrchestrator } from '../orchestrator/orchestrator.js'
import type { AgentGateRequestContext } from '../gateway/context.js'
import { normalizeControlMode } from '../control/control-modes.js'
import { createOverrideState } from '../control/override-policy.js'
import { AgentGateMemoryStore } from '../store/memory-store.js'
import { ConversationService } from './conversation-service.js'
import { OverrideService } from './override-service.js'
import { SummaryService } from './summary-service.js'
import { TaskService } from './task-service.js'
import {
  createAgentILSSessionMessage,
  createRunEvent,
  type AgentILSSessionPendingInteraction,
  type AgentILSSessionState,
  type StartRunInput,
  type RunStatus,
  type RunStep,
} from '../types/index.js'
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
  session: AgentILSSessionState | null
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

export interface BeginUiApprovalInput extends UiRuntimeOptions {
  summary: string
  riskLevel: 'low' | 'medium' | 'high'
  toolName?: string
  targets?: string[]
}

export interface RecordUiApprovalInput extends UiRuntimeOptions {
  summary: string
  action: 'accept' | 'decline' | 'cancel'
  status?: 'continue' | 'done' | 'revise'
  message?: string
}

export interface RecordUiFeedbackInput extends UiRuntimeOptions {
  status: 'continue' | 'done' | 'revise'
  message?: string
}

export interface UiConversationFinishResult {
  conversationState: string
  allowedToFinish: boolean
  reason: string | null
  snapshot: UiRuntimeSnapshot
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

function createUiRequestContext(tracePrefix = 'ui_action', runId?: string): AgentGateRequestContext {
  return {
    runId,
    traceId: `${tracePrefix}_${randomUUID()}`,
    interactionAllowed: false,
    now: () => new Date().toISOString(),
    async elicitUser() {
      throw new Error('User interaction is not allowed from UI request contexts.')
    },
  }
}

export function buildUiActionServices(store: AgentGateMemoryStore, orchestrator: AgentGateOrchestrator) {
  return {
    store,
    orchestrator,
    conversation: new ConversationService(store),
    task: new TaskService(store),
    summary: new SummaryService(store),
    override: new OverrideService(store),
  }
}

export type UiActionServices = ReturnType<typeof buildUiActionServices>

function createServices(stateFilePath?: string | null): UiActionServices {
  const store = new AgentGateMemoryStore(stateFilePath ?? undefined)
  const orchestrator = new AgentGateOrchestrator(store)
  return buildUiActionServices(store, orchestrator)
}

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

function appendSessionUserMessage(
  services: UiActionServices,
  sessionId: string,
  content: string,
  queueUserMessage = true,
) {
  services.store.appendSessionMessage(
    sessionId,
    createAgentILSSessionMessage({
      role: 'user',
      kind: 'text',
      content,
      state: 'final',
    }),
    queueUserMessage,
  )
}

function appendSessionSystemStatusMessage(services: UiActionServices, sessionId: string, content: unknown) {
  services.store.appendSessionMessage(
    sessionId,
    createAgentILSSessionMessage({
      role: 'system',
      kind: 'status',
      content,
      state: 'final',
    }),
  )
}

function openSessionInteraction(
  services: UiActionServices,
  sessionId: string,
  interaction: AgentILSSessionPendingInteraction,
) {
  services.store.openSessionInteraction(sessionId, interaction)
  appendSessionSystemStatusMessage(services, sessionId, {
    type: 'interaction_opened',
    requestId: interaction.requestId,
    interactionKind: interaction.kind,
    title: interaction.title,
  })
}

function resolveSessionInteraction(services: UiActionServices, sessionId: string, payload: unknown) {
  const session = services.store.getSession(sessionId)
  if (!session?.pendingInteraction) {
    return
  }
  appendSessionSystemStatusMessage(services, sessionId, {
    type: 'interaction_resolved',
    requestId: session.pendingInteraction.requestId,
    interactionKind: session.pendingInteraction.kind,
    payload,
  })
  services.store.clearSessionInteraction(sessionId)
}

function buildRuntimeSnapshotInternal(options: UiRuntimeOptions = {}, injectedServices?: UiActionServices): UiRuntimeSnapshot {
  const services = injectedServices ?? createServices(options.stateFilePath)
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
    session: resolveOrCreateSessionForSnapshot(services, options.preferredRunId, conversationSurface.conversation.conversationId),
  }
}

/**
 * Resolve an existing active session or create a new one so the WebView always
 * has a usable session.  Finished / stale sessions from previous debug runs are
 * left in the Map but not re-surfaced.
 */
function resolveOrCreateSessionForSnapshot(
  services: UiActionServices,
  preferredRunId?: string | null,
  conversationId?: string,
): AgentILSSessionState {
  const existing = services.store.getCurrentSession(preferredRunId)
  if (existing && existing.status === 'active') {
    return existing
  }
  // No active session — create a fresh one bound to the conversation.
  return services.store.createSession({
    conversationId: conversationId ?? 'conversation_default',
    runId: preferredRunId ?? null,
  })
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

export function buildUiRuntimeSnapshot(options: UiRuntimeOptions = {}, injectedServices?: UiActionServices): UiRuntimeSnapshot {
  return buildRuntimeSnapshotInternal(options, injectedServices)
}

export function startUiTask(input: StartRunInput & UiRuntimeOptions, injectedServices?: UiActionServices): UiRuntimeSnapshot {
  const services = injectedServices ?? createServices(input.stateFilePath)
  const run = services.task.startTask(input)
  const session = services.store.ensureSessionForRun(run.runId)
  const boundSession = services.store.bindSessionToRun(session.sessionId, run.runId)
  if (input.goal.trim()) {
    const alreadyQueued = boundSession.queuedUserMessageIds.length > 0
    if (!alreadyQueued) {
      appendSessionUserMessage(services, boundSession.sessionId, input.goal.trim())
    }
  }
  appendSessionSystemStatusMessage(services, boundSession.sessionId, {
    type: 'task_started',
    runId: run.runId,
    title: run.title,
    goal: run.goal,
  })
  return buildRuntimeSnapshotInternal({
    stateFilePath: input.stateFilePath,
    preferredRunId: run.runId,
  }, services)
}

export function continueUiTask(input: ContinueTaskInput = {}, injectedServices?: UiActionServices): UiRuntimeSnapshot {
  const services = injectedServices ?? createServices(input.stateFilePath)
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
  }, services)
}

export function acceptUiOverride(input: AcceptOverrideInput, injectedServices?: UiActionServices): UiRuntimeSnapshot {
  const services = injectedServices ?? createServices(input.stateFilePath)
  const runId = services.override.resolveRunId(input.preferredRunId)
  if (!runId) {
    return buildRuntimeSnapshotInternal(input)
  }

  const envelope = services.task.getTaskEnvelope(runId)
  if (!envelope) {
    return buildRuntimeSnapshotInternal(input)
  }
  const { run, taskCard } = envelope
  const ctx = createUiRequestContext('ui_action_override', runId)
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
  const nextRun = services.task.getRun(runId)
  services.store.appendRunEvent(
    createRunEvent(runId, 'run.updated', {
      reason: 'ui.override.accepted',
      taskId: run.taskId,
      conversationId: run.conversationId,
      controlMode: nextRun?.controlMode ?? taskCard.controlMode,
      overrideLevel: overrideState.level,
      traceId: ctx.traceId,
      recordedAt: ctx.now(),
    }),
  )
  services.store.log(runId, 'info', 'ui.override.accepted', 'UI override acknowledgement recorded.', {
    taskId: run.taskId,
    conversationId: run.conversationId,
    controlMode: nextRun?.controlMode ?? taskCard.controlMode,
    overrideLevel: overrideState.level,
    traceId: ctx.traceId,
    recordedAt: ctx.now(),
  })

  return buildRuntimeSnapshotInternal({
    stateFilePath: input.stateFilePath,
    preferredRunId: runId,
  }, services)
}

export function beginUiApproval(input: BeginUiApprovalInput, injectedServices?: UiActionServices): UiRuntimeSnapshot {
  const services = injectedServices ?? createServices(input.stateFilePath)
  const runId = services.task.resolveRunId(input.preferredRunId)
  if (!runId) {
    return buildRuntimeSnapshotInternal(input)
  }

  const ctx = createUiRequestContext('ui_action_approval_begin', runId)
  services.orchestrator.beginApprovalRequest(ctx, {
    runId,
    summary: input.summary,
    riskLevel: input.riskLevel,
    toolName: input.toolName,
    targets: input.targets ?? [],
  })
  const session = services.store.ensureSessionForRun(runId)
  openSessionInteraction(services, session.sessionId, {
    requestId: `approval_${randomUUID()}`,
    kind: 'approval',
    runId,
    title: 'Approval Required',
    description: input.summary,
    required: false,
    options: [],
    summary: input.summary,
    riskLevel: input.riskLevel,
    targets: input.targets ?? [],
    risks: [],
    controlMode: services.task.getTaskCard(runId)?.controlMode as 'normal' | 'alternate' | 'direct' | undefined,
  })

  return buildRuntimeSnapshotInternal({
    stateFilePath: input.stateFilePath,
    preferredRunId: runId,
  }, services)
}

export function recordUiApproval(input: RecordUiApprovalInput, injectedServices?: UiActionServices): UiRuntimeSnapshot {
  const services = injectedServices ?? createServices(input.stateFilePath)
  const runId = services.task.resolveRunId(input.preferredRunId)
  if (!runId) {
    return buildRuntimeSnapshotInternal(input)
  }

  const ctx = createUiRequestContext('ui_action_approval_result', runId)
  services.orchestrator.recordApproval(
    runId,
    input.summary,
    {
      action: input.action,
      payload: input.status
        ? {
            status: input.status,
            msg: input.message ?? '',
          }
        : undefined,
    },
    ctx,
  )
  const session = services.store.ensureSessionForRun(runId)
  resolveSessionInteraction(services, session.sessionId, {
    type: 'approval',
    action: input.action,
    status: input.status,
    message: input.message ?? '',
  })

  return buildRuntimeSnapshotInternal({
    stateFilePath: input.stateFilePath,
    preferredRunId: runId,
  }, services)
}

export function markUiTaskDone(input: MarkTaskDoneInput = {}, injectedServices?: UiActionServices): UiRuntimeSnapshot {
  const services = injectedServices ?? createServices(input.stateFilePath)
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

  const ctx = createUiRequestContext('ui_action_done', runId)
  services.orchestrator.controlMode.recordFeedback(runId, {
    status: 'done',
    msg:
      input.summary?.trim() ??
      (normalizeControlMode(taskCard.controlMode) === 'direct' || Boolean(taskCard.overrideState?.confirmed)
        ? 'Marked done from AgentILS VS Code task console under override/direct mode.'
        : 'Marked done from AgentILS VS Code task console.'),
  }, ctx)
  services.orchestrator.verifyRun(runId, true, ctx)

  return buildRuntimeSnapshotInternal({
    stateFilePath: input.stateFilePath,
    preferredRunId: runId,
  }, services)
}

export function recordUiFeedback(input: RecordUiFeedbackInput, injectedServices?: UiActionServices): UiRuntimeSnapshot {
  const services = injectedServices ?? createServices(input.stateFilePath)
  const runId = services.task.resolveRunId(input.preferredRunId)
  if (!runId) {
    return buildRuntimeSnapshotInternal(input)
  }

  const ctx = createUiRequestContext('ui_action_feedback', runId)
  services.orchestrator.recordFeedback(runId, {
    status: input.status,
    msg: input.message ?? '',
  }, ctx)
  const session = services.store.ensureSessionForRun(runId)
  resolveSessionInteraction(services, session.sessionId, {
    type: 'feedback',
    status: input.status,
    message: input.message ?? '',
  })

  if (input.status === 'done') {
    services.orchestrator.verifyRun(runId, true, ctx)
  }

  return buildRuntimeSnapshotInternal({
    stateFilePath: input.stateFilePath,
    preferredRunId: runId,
  }, services)
}

export function endUiConversation(input: EndConversationInput = {}, injectedServices?: UiActionServices): UiRuntimeSnapshot {
  const services = injectedServices ?? createServices(input.stateFilePath)
  try {
    services.conversation.endConversation(input.preferredRunId)
  } catch {
    return buildRuntimeSnapshotInternal(input, services)
  }

  return buildRuntimeSnapshotInternal({
    stateFilePath: input.stateFilePath,
    preferredRunId: input.preferredRunId,
  }, services)
}

export function finishUiConversation(
  input: EndConversationInput = {},
  injectedServices?: UiActionServices,
): UiConversationFinishResult {
  const services = injectedServices ?? createServices(input.stateFilePath)
  const preview = services.conversation.previewConversationStopGate(input.preferredRunId, true)

  if (preview.allowed) {
    services.conversation.endConversation(input.preferredRunId)
  }
  const session = services.store.getCurrentSession(input.preferredRunId)
  if (preview.allowed && session) {
    services.store.finishSession(session.sessionId)
    appendSessionSystemStatusMessage(services, session.sessionId, {
      type: 'session_finished',
      conversationId: session.conversationId,
    })
  }

  const snapshot = buildRuntimeSnapshotInternal({
    stateFilePath: input.stateFilePath,
    preferredRunId: input.preferredRunId,
  }, services)

  return {
    conversationState: snapshot.conversation.state,
    allowedToFinish: preview.allowed,
    reason: preview.reasons.join(' ').trim() || null,
    snapshot,
  }
}
