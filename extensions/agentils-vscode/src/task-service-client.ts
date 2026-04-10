import * as vscode from 'vscode'
import {
  type AcceptOverrideInput,
  type AgentILSConversationSnapshot,
  type AgentILSControlMode,
  type AgentILSOverrideState,
  type AgentILSRuntimeSnapshot,
  type AgentILSTaskPhase,
  type AgentILSTaskSnapshot,
  type AgentILSTaskStatus,
  type AgentILSTaskSummaryDocument,
  type ContinueTaskInput,
  type MarkTaskDoneInput,
  type StartTaskInput,
} from './model'

interface PersistedState {
  conversation: AgentILSConversationSnapshot
  tasks: Record<string, AgentILSTaskSnapshot>
  latestSummaryTaskId: string | null
}

export interface AgentILSTaskServiceClient {
  readonly onDidChange: vscode.Event<AgentILSRuntimeSnapshot>
  snapshot(): AgentILSRuntimeSnapshot
  startTask(input: StartTaskInput): Promise<AgentILSRuntimeSnapshot>
  continueTask(input?: ContinueTaskInput): Promise<AgentILSRuntimeSnapshot | null>
  markTaskDone(input?: MarkTaskDoneInput): Promise<AgentILSRuntimeSnapshot | null>
  acceptOverride(input: AcceptOverrideInput): Promise<AgentILSRuntimeSnapshot | null>
  getSummaryDocument(taskId?: string | null): AgentILSTaskSummaryDocument | null
  openSummaryDocument(taskId?: string | null): Promise<vscode.Uri | null>
}

const STORAGE_SUFFIX = 'agentils.vscode.taskServiceState'
const TASK_PHASES: AgentILSTaskPhase[] = ['collect', 'confirm_elements', 'plan', 'approval', 'execute', 'handoff_prepare', 'verify', 'done']

function nowIso() {
  return new Date().toISOString()
}

function createConversationId() {
  return `conversation-${Date.now().toString(36)}`
}

function createTaskId() {
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createEmptyOverrideState(): AgentILSOverrideState {
  return {
    confirmed: false,
    acknowledgedAt: null,
    note: null,
  }
}

function createTaskSummaryMarkdown(task: AgentILSTaskSnapshot, summary: string | undefined) {
  const lines = [
    `# AgentILS Task Summary`,
    ``,
    `- Task ID: ${task.taskId}`,
    `- Title: ${task.title}`,
    `- Goal: ${task.goal}`,
    `- Control Mode: ${task.controlMode}`,
    `- Phase: ${task.phase}`,
    `- Status: ${task.status}`,
    `- Generated At: ${nowIso()}`,
    ``,
    `## Outcome`,
    summary?.trim() || `Task completed without an explicit user summary.`,
    ``,
  ]

  if (task.constraints.length > 0) {
    lines.push(`## Constraints`)
    for (const constraint of task.constraints) {
      lines.push(`- ${constraint}`)
    }
    lines.push(``)
  }

  if (task.risks.length > 0) {
    lines.push(`## Risks`)
    for (const risk of task.risks) {
      lines.push(`- ${risk}`)
    }
    lines.push(``)
  }

  if (task.notes.length > 0) {
    lines.push(`## Notes`)
    for (const note of task.notes) {
      lines.push(`- ${note}`)
    }
    lines.push(``)
  }

  return lines.join('\n')
}

function createTaskSnapshot(input: StartTaskInput): AgentILSTaskSnapshot {
  const createdAt = nowIso()
  return {
    taskId: createTaskId(),
    title: input.title,
    goal: input.goal,
    controlMode: input.controlMode ?? 'normal',
    phase: 'collect',
    status: 'active',
    scope: input.scope ?? [],
    constraints: input.constraints ?? [],
    risks: input.risks ?? [],
    openQuestions: input.openQuestions ?? [],
    assumptions: input.assumptions ?? [],
    decisionNeededFromUser: input.decisionNeededFromUser ?? [],
    notes: [],
    overrideState: createEmptyOverrideState(),
    summaryDocument: null,
    createdAt,
    updatedAt: createdAt,
  }
}

function createInitialState(): PersistedState {
  const createdAt = nowIso()
  return {
    conversation: {
      conversationId: createConversationId(),
      state: 'await_next_task',
      taskIds: [],
      activeTaskId: null,
      lastSummaryTaskId: null,
      createdAt,
      updatedAt: createdAt,
    },
    tasks: {},
    latestSummaryTaskId: null,
  }
}

function advancePhase(phase: AgentILSTaskPhase): AgentILSTaskPhase {
  const index = TASK_PHASES.indexOf(phase)
  if (index < 0 || index >= TASK_PHASES.length - 1) {
    return phase
  }
  return TASK_PHASES[index + 1]
}

function buildSnapshot(state: PersistedState): AgentILSRuntimeSnapshot {
  const activeTaskId = state.conversation.activeTaskId
  const activeTask = activeTaskId ? state.tasks[activeTaskId] ?? null : null
  const taskHistory = state.conversation.taskIds.map((taskId) => state.tasks[taskId]).filter((task): task is AgentILSTaskSnapshot => Boolean(task))
  const latestSummaryTaskId = state.latestSummaryTaskId
  const latestSummary = latestSummaryTaskId ? state.tasks[latestSummaryTaskId]?.summaryDocument ?? null : null

  return {
    conversation: state.conversation,
    activeTask,
    taskHistory,
    latestSummary,
  }
}

export class MementoAgentILSTaskServiceClient implements AgentILSTaskServiceClient {
  private readonly emitter = new vscode.EventEmitter<AgentILSRuntimeSnapshot>()
  private state: PersistedState

  readonly onDidChange = this.emitter.event

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly storageKey = STORAGE_SUFFIX,
  ) {
    this.state = this.loadState()
  }

  snapshot(): AgentILSRuntimeSnapshot {
    return buildSnapshot(this.state)
  }

  async startTask(input: StartTaskInput): Promise<AgentILSRuntimeSnapshot> {
    if (this.state.conversation.activeTaskId) {
      throw new Error('An active task already exists. Finish it before starting a new one.')
    }

    const task = createTaskSnapshot(input)
    this.state.tasks[task.taskId] = task
    this.state.conversation.taskIds.push(task.taskId)
    this.state.conversation.activeTaskId = task.taskId
    this.state.conversation.state = 'active_task'
    this.touchConversation()
    await this.persist()
    return this.emitSnapshot()
  }

  async continueTask(input: ContinueTaskInput = {}): Promise<AgentILSRuntimeSnapshot | null> {
    const task = this.getActiveTask()
    if (!task) {
      return null
    }

    if (input.note?.trim()) {
      task.notes.push(input.note.trim())
    }

    if (task.status === 'active' && task.phase !== 'verify') {
      task.phase = advancePhase(task.phase)
    }

    task.updatedAt = nowIso()
    this.touchConversation()
    await this.persist()
    return this.emitSnapshot()
  }

  async markTaskDone(input: MarkTaskDoneInput = {}): Promise<AgentILSRuntimeSnapshot | null> {
    const task = this.getActiveTask()
    if (!task) {
      return null
    }

    task.phase = 'done'
    task.status = 'done'
    task.updatedAt = nowIso()
    task.summaryDocument = await this.ensureSummaryDocument(task, input.summary)

    this.state.conversation.activeTaskId = null
    this.state.conversation.state = 'await_next_task'
    this.state.conversation.lastSummaryTaskId = task.taskId
    this.state.latestSummaryTaskId = task.taskId
    this.touchConversation()
    await this.persist()
    return this.emitSnapshot()
  }

  async acceptOverride(input: AcceptOverrideInput): Promise<AgentILSRuntimeSnapshot | null> {
    const task = this.getActiveTask()
    if (!task) {
      return null
    }

    task.overrideState = {
      confirmed: true,
      acknowledgedAt: nowIso(),
      note: input.acknowledgement.trim(),
    }
    task.controlMode = 'direct'
    task.updatedAt = nowIso()
    this.touchConversation()
    await this.persist()
    return this.emitSnapshot()
  }

  getSummaryDocument(taskId?: string | null): AgentILSTaskSummaryDocument | null {
    const resolvedTaskId = taskId ?? this.state.conversation.activeTaskId ?? this.state.latestSummaryTaskId
    if (!resolvedTaskId) {
      return null
    }
    return this.state.tasks[resolvedTaskId]?.summaryDocument ?? null
  }

  async openSummaryDocument(taskId?: string | null): Promise<vscode.Uri | null> {
    const summary = this.getSummaryDocument(taskId)
    if (!summary) {
      return null
    }
    return vscode.Uri.file(summary.filePath)
  }

  private getActiveTask() {
    const activeTaskId = this.state.conversation.activeTaskId
    if (!activeTaskId) {
      return null
    }
    return this.state.tasks[activeTaskId] ?? null
  }

  private async ensureSummaryDocument(task: AgentILSTaskSnapshot, summary: string | undefined) {
    const summaryRoot = vscode.Uri.joinPath(this.context.globalStorageUri, 'summaries')
    await vscode.workspace.fs.createDirectory(summaryRoot)

    const filePath = vscode.Uri.joinPath(summaryRoot, `${task.taskId}.md`)
    const existing = this.state.tasks[task.taskId]?.summaryDocument
    const markdown = createTaskSummaryMarkdown(task, summary)
    const document: AgentILSTaskSummaryDocument = {
      taskId: task.taskId,
      title: task.title,
      filePath: filePath.fsPath,
      markdown,
      generatedAt: existing?.generatedAt ?? nowIso(),
      updatedAt: nowIso(),
      userEdited: existing?.userEdited ?? false,
    }

    await vscode.workspace.fs.writeFile(filePath, Buffer.from(markdown, 'utf8'))
    return document
  }

  private loadState(): PersistedState {
    const raw = this.context.globalState.get<PersistedState>(this.storageKey)
    if (!raw) {
      return createInitialState()
    }

    return {
      conversation: raw.conversation ?? createInitialState().conversation,
      tasks: raw.tasks ?? {},
      latestSummaryTaskId: raw.latestSummaryTaskId ?? null,
    }
  }

  private async persist() {
    await this.context.globalState.update(this.storageKey, this.state)
  }

  private touchConversation() {
    this.state.conversation.updatedAt = nowIso()
    if (!this.state.conversation.activeTaskId && this.state.conversation.state === 'active_task') {
      this.state.conversation.state = 'await_next_task'
    }
  }

  private emitSnapshot() {
    const snapshot = buildSnapshot(this.state)
    this.emitter.fire(snapshot)
    return snapshot
  }
}
