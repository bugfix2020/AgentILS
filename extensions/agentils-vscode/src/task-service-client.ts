import { execFile, execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import * as vscode from 'vscode'
import { log } from './logger'
import type {
  AcceptOverrideInput,
  AgentILSApprovalRequestInput,
  AgentILSApprovalResult,
  AgentILSConversationSnapshot,
  AgentILSFinishConversationResult,
  AgentILSFeedbackResult,
  AgentILSRecordApprovalInput,
  AgentILSRecordFeedbackInput,
  AgentILSRuntimeSnapshot,
  AgentILSTaskSummaryDocument,
  ContinueTaskInput,
  MarkTaskDoneInput,
  StartTaskInput,
} from './model'

const execFileAsync = promisify(execFile)

const runnerScript = `
import { pathToFileURL } from 'node:url';

const [modulePath, actionName, payloadJson] = process.argv.slice(1);
const payload = payloadJson ? JSON.parse(payloadJson) : {};
const module = await import(pathToFileURL(modulePath).href);
const action = module[actionName];

if (typeof action !== 'function') {
  throw new Error(\`Unknown AgentILS control-plane action: \${actionName}\`);
}

const result = await action(payload);
process.stdout.write(JSON.stringify(result));
`

function nowIso() {
  return new Date().toISOString()
}

function createEmptyConversationSnapshot(): AgentILSConversationSnapshot {
  const now = nowIso()
  return {
    conversationId: 'conversation_default',
    state: 'await_next_task',
    taskIds: [],
    activeTaskId: null,
    lastSummaryTaskId: null,
    createdAt: now,
    updatedAt: now,
  }
}

function createEmptySnapshot(): AgentILSRuntimeSnapshot {
  return {
    conversation: createEmptyConversationSnapshot(),
    activeTask: null,
    taskHistory: [],
    latestSummary: null,
  }
}

class AgentILSRuntimeHttpError extends Error {
  constructor(action: string, baseUrl: string, cause?: unknown) {
    super(
      `AgentILS HTTP runtime is unavailable for ${action} at ${baseUrl}. ` +
        `Start the workspace server with "pnpm run dev:http" or configure ` +
        '`agentils.runtime.httpBaseUrl`.',
    )
    this.name = 'AgentILSRuntimeHttpError'
    this.cause = cause instanceof Error ? cause : undefined
  }
}

class AgentILSRuntimeLocalError extends Error {
  constructor(controlPlaneModulePath: string, cause?: unknown) {
    const causeText = cause instanceof Error ? cause.message : String(cause ?? 'Unknown error')
    super(
      `AgentILS local runtime is unavailable. Expected built control-plane module at ` +
        `${controlPlaneModulePath}. Run "pnpm run build" first. Cause: ${causeText}`,
    )
    this.name = 'AgentILSRuntimeLocalError'
    this.cause = cause instanceof Error ? cause : undefined
  }
}

export interface AgentILSTaskServiceClient {
  readonly onDidChange: vscode.Event<AgentILSRuntimeSnapshot>
  snapshot(): AgentILSRuntimeSnapshot
  refresh(): Promise<AgentILSRuntimeSnapshot>
  startTask(input: StartTaskInput): Promise<AgentILSRuntimeSnapshot>
  continueTask(input?: ContinueTaskInput): Promise<AgentILSRuntimeSnapshot | null>
  markTaskDone(input?: MarkTaskDoneInput): Promise<AgentILSRuntimeSnapshot | null>
  acceptOverride(input: AcceptOverrideInput): Promise<AgentILSRuntimeSnapshot | null>
  beginApproval(input: AgentILSApprovalRequestInput): Promise<AgentILSRuntimeSnapshot>
  recordApproval(input: AgentILSRecordApprovalInput): Promise<AgentILSRuntimeSnapshot>
  recordFeedback(input: AgentILSRecordFeedbackInput): Promise<AgentILSRuntimeSnapshot>
  finishConversation(input?: { preferredRunId?: string }): Promise<AgentILSFinishConversationResult>
  getSummaryDocument(taskId?: string | null): AgentILSTaskSummaryDocument | null
  openSummaryDocument(taskId?: string | null): Promise<vscode.Uri | null>
}

function ensureWorkspaceRoot(): void {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
  if (!workspaceFolder) {
    throw new Error('AgentILS requires an open workspace folder.')
  }
}

function resolveConfigPath(settingKey: string, fallback: string): string {
  const configured = vscode.workspace.getConfiguration('agentils').get<string>(settingKey)?.trim()
  return configured && configured.length > 0 ? configured : fallback
}

function resolveRuntimeBaseUrl(): string | null {
  const config = vscode.workspace.getConfiguration('agentils')
  const configuredBaseUrl = config.get<string>('runtime.httpBaseUrl')?.trim()
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, '')
  }
  return null
}

function resolveDefaultControlPlaneModulePath(context: vscode.ExtensionContext, workspaceRoot: string): string {
  const extensionRelativePath = join(context.extensionPath, '..', '..', 'packages', 'mcp', 'dist', 'control-plane', 'index.js')
  if (existsSync(extensionRelativePath)) {
    return extensionRelativePath
  }

  const workspacePackagePath = join(workspaceRoot, 'packages', 'mcp', 'dist', 'control-plane', 'index.js')
  if (existsSync(workspacePackagePath)) {
    return workspacePackagePath
  }

  return join(workspaceRoot, 'dist', 'control-plane', 'index.js')
}

export class RepoBackedAgentILSTaskServiceClient implements AgentILSTaskServiceClient {
  private readonly emitter = new vscode.EventEmitter<AgentILSRuntimeSnapshot>()
  private readonly workspaceRoot: string
  private readonly controlPlaneModulePath: string
  private readonly stateFilePath: string
  private currentSnapshot: AgentILSRuntimeSnapshot

  readonly onDidChange = this.emitter.event

  constructor(_context: vscode.ExtensionContext) {
    ensureWorkspaceRoot()
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
    this.workspaceRoot = workspaceFolder!.uri.fsPath
    this.controlPlaneModulePath = resolveConfigPath(
      'runtime.controlPlaneModulePath',
      resolveDefaultControlPlaneModulePath(_context, this.workspaceRoot),
    )
    this.stateFilePath = resolveConfigPath('runtime.stateFilePath', join(this.workspaceRoot, '.data/agentils-state.json'))
    this.currentSnapshot = createEmptySnapshot()
  }

  snapshot(): AgentILSRuntimeSnapshot {
    return this.currentSnapshot
  }

  async refresh(): Promise<AgentILSRuntimeSnapshot> {
    const snapshot = await this.invokeAsync<AgentILSRuntimeSnapshot>('buildUiRuntimeSnapshot', {})
    this.currentSnapshot = snapshot
    this.emitter.fire(snapshot)
    return snapshot
  }

  async startTask(input: StartTaskInput): Promise<AgentILSRuntimeSnapshot> {
    return this.runMutation('startUiTask', input)
  }

  async continueTask(input: ContinueTaskInput = {}): Promise<AgentILSRuntimeSnapshot | null> {
    return this.runMutation('continueUiTask', input)
  }

  async markTaskDone(input: MarkTaskDoneInput = {}): Promise<AgentILSRuntimeSnapshot | null> {
    return this.runMutation('markUiTaskDone', input)
  }

  async acceptOverride(input: AcceptOverrideInput): Promise<AgentILSRuntimeSnapshot | null> {
    return this.runMutation('acceptUiOverride', input)
  }

  async beginApproval(input: AgentILSApprovalRequestInput): Promise<AgentILSRuntimeSnapshot> {
    return this.runMutation('beginUiApproval', input)
  }

  async recordApproval(input: AgentILSRecordApprovalInput): Promise<AgentILSRuntimeSnapshot> {
    return this.runMutation('recordUiApproval', {
      preferredRunId: input.preferredRunId,
      summary: input.summary,
      action: input.action,
      status: input.status === 'cancel' ? undefined : input.status,
      message: input.message,
    })
  }

  async recordFeedback(input: AgentILSRecordFeedbackInput): Promise<AgentILSRuntimeSnapshot> {
    return this.runMutation('recordUiFeedback', {
      preferredRunId: input.preferredRunId,
      status: input.status === 'cancel' ? 'continue' : input.status,
      message: input.message,
    })
  }

  async finishConversation(input: { preferredRunId?: string } = {}): Promise<AgentILSFinishConversationResult> {
    return this.invokeAsync('finishUiConversation', input) as Promise<AgentILSFinishConversationResult>
  }

  getSummaryDocument(taskId?: string | null): AgentILSTaskSummaryDocument | null {
    if (taskId) {
      const task = this.currentSnapshot.taskHistory.find((candidate) => candidate.taskId === taskId)
      return task?.summaryDocument ?? null
    }
    return this.currentSnapshot.latestSummary
  }

  async openSummaryDocument(taskId?: string | null): Promise<vscode.Uri | null> {
    const summary = this.getSummaryDocument(taskId)
    if (!summary) {
      return null
    }
    return vscode.Uri.file(summary.filePath)
  }

  private invokeSync(action: string, payload: object): AgentILSRuntimeSnapshot {
    this.ensureLocalRuntimeAvailable()
    try {
      const stdout = execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          runnerScript,
          this.controlPlaneModulePath,
          action,
          JSON.stringify(this.withRuntimeOptions(payload)),
        ],
        {
          cwd: this.workspaceRoot,
          encoding: 'utf8',
        },
      )
      return JSON.parse(stdout) as AgentILSRuntimeSnapshot
    } catch (error) {
      throw new AgentILSRuntimeLocalError(this.controlPlaneModulePath, error)
    }
  }

  private async runMutation<T extends object>(action: string, payload: T): Promise<AgentILSRuntimeSnapshot> {
    log('client', `runMutation: ${action}`)
    const snapshot = await this.invokeAsync<AgentILSRuntimeSnapshot>(action, payload)
    log('client', `runMutation done: ${action}`, { conversationState: snapshot.conversation.state, activeTaskId: snapshot.activeTask?.taskId })
    this.currentSnapshot = snapshot
    this.emitter.fire(snapshot)
    return snapshot
  }

  private async invokeAsync<T>(action: string, payload: object): Promise<T> {
    log('client', `invokeAsync: ${action}`)
    const baseUrl = resolveRuntimeBaseUrl()
    if (baseUrl) {
      return this.invokeHttp<T>(action, payload, baseUrl)
    }

    this.ensureLocalRuntimeAvailable()
    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          runnerScript,
          this.controlPlaneModulePath,
          action,
          JSON.stringify(this.withRuntimeOptions(payload)),
        ],
        {
          cwd: this.workspaceRoot,
          encoding: 'utf8',
        },
      )
      return JSON.parse(stdout) as T
    } catch (error) {
      throw new AgentILSRuntimeLocalError(this.controlPlaneModulePath, error)
    }
  }

  private async invokeHttp<T>(action: string, payload: object, baseUrl: string): Promise<T> {
    const endpointMap: Record<string, string> = {
      'buildUiRuntimeSnapshot': '/api/ui/snapshot',
      'startUiTask': '/api/ui/start_task',
      'continueUiTask': '/api/ui/continue_task',
      'acceptUiOverride': '/api/ui/override',
      'beginUiApproval': '/api/ui/approval/begin',
      'recordUiApproval': '/api/ui/approval/record',
      'recordUiFeedback': '/api/ui/feedback/record',
      'markUiTaskDone': '/api/ui/mark_done',
      'endUiConversation': '/api/ui/end_conversation',
      'finishUiConversation': '/api/ui/finish_conversation',
    }

    const endpoint = endpointMap[action]
    if (!endpoint) {
      throw new Error(`Unknown UI Action: ${action}`)
    }

    try {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const responseBody = (await response.text()).trim()
        throw new Error(responseBody || `AgentILS server returned ${response.status} ${response.statusText}`)
      }

      return (await response.json()) as T
    } catch (error) {
      throw new AgentILSRuntimeHttpError(action, baseUrl, error)
    }
  }

  private withRuntimeOptions(payload: object) {
    return {
      ...(payload as Record<string, unknown>),
      stateFilePath: this.stateFilePath,
    }
  }

  private ensureLocalRuntimeAvailable() {
    if (!existsSync(this.controlPlaneModulePath)) {
      throw new AgentILSRuntimeLocalError(this.controlPlaneModulePath)
    }
  }
}
