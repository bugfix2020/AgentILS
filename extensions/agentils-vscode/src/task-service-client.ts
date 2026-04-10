import { execFile, execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import * as vscode from 'vscode'
import type {
  AcceptOverrideInput,
  AgentILSConversationSnapshot,
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

interface RepoRuntimeConfig {
  workspaceRoot: string
  controlPlaneModulePath: string
  stateFilePath: string
}

export interface AgentILSTaskServiceClient {
  readonly onDidChange: vscode.Event<AgentILSRuntimeSnapshot>
  snapshot(): AgentILSRuntimeSnapshot
  refresh(): Promise<AgentILSRuntimeSnapshot>
  startTask(input: StartTaskInput): Promise<AgentILSRuntimeSnapshot>
  continueTask(input?: ContinueTaskInput): Promise<AgentILSRuntimeSnapshot | null>
  markTaskDone(input?: MarkTaskDoneInput): Promise<AgentILSRuntimeSnapshot | null>
  acceptOverride(input: AcceptOverrideInput): Promise<AgentILSRuntimeSnapshot | null>
  getSummaryDocument(taskId?: string | null): AgentILSTaskSummaryDocument | null
  openSummaryDocument(taskId?: string | null): Promise<vscode.Uri | null>
}

function resolveWorkspaceRoot(): string {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
  if (!workspaceFolder) {
    throw new Error('AgentILS requires an open workspace folder to resolve the runtime store.')
  }
  return workspaceFolder.uri.fsPath
}

function resolveConfigPath(settingKey: string, fallback: string): string {
  const configured = vscode.workspace.getConfiguration('agentils').get<string>(settingKey)?.trim()
  return configured && configured.length > 0 ? configured : fallback
}

export class RepoBackedAgentILSTaskServiceClient implements AgentILSTaskServiceClient {
  private readonly emitter = new vscode.EventEmitter<AgentILSRuntimeSnapshot>()
  private readonly runtimeConfig: RepoRuntimeConfig
  private currentSnapshot: AgentILSRuntimeSnapshot

  readonly onDidChange = this.emitter.event

  constructor(_context: vscode.ExtensionContext) {
    const workspaceRoot = resolveWorkspaceRoot()
    this.runtimeConfig = {
      workspaceRoot,
      controlPlaneModulePath: resolveConfigPath(
        'runtime.controlPlaneModulePath',
        join(workspaceRoot, 'dist/control-plane/index.js'),
      ),
      stateFilePath: resolveConfigPath('runtime.stateFilePath', join(workspaceRoot, '.data/agentils-state.json')),
    }
    this.currentSnapshot = this.safeSnapshot()
  }

  snapshot(): AgentILSRuntimeSnapshot {
    return this.currentSnapshot
  }

  async refresh(): Promise<AgentILSRuntimeSnapshot> {
    const snapshot = await this.invokeAsync('buildUiRuntimeSnapshot', {})
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

  private safeSnapshot(): AgentILSRuntimeSnapshot {
    try {
      return this.invokeSync('buildUiRuntimeSnapshot', {})
    } catch {
      return createEmptySnapshot()
    }
  }

  private async runMutation<T extends object>(action: string, payload: T): Promise<AgentILSRuntimeSnapshot> {
    const snapshot = await this.invokeAsync(action, payload)
    this.currentSnapshot = snapshot
    this.emitter.fire(snapshot)
    return snapshot
  }

  private invokeSync(action: string, payload: object): AgentILSRuntimeSnapshot {
    this.ensureRuntimeAvailable()
    const stdout = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        runnerScript,
        this.runtimeConfig.controlPlaneModulePath,
        action,
        JSON.stringify(this.withRuntimeOptions(payload)),
      ],
      {
        cwd: this.runtimeConfig.workspaceRoot,
        encoding: 'utf8',
      },
    )
    return JSON.parse(stdout) as AgentILSRuntimeSnapshot
  }

  private async invokeAsync(action: string, payload: object): Promise<AgentILSRuntimeSnapshot> {
    this.ensureRuntimeAvailable()
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        runnerScript,
        this.runtimeConfig.controlPlaneModulePath,
        action,
        JSON.stringify(this.withRuntimeOptions(payload)),
      ],
      {
        cwd: this.runtimeConfig.workspaceRoot,
        encoding: 'utf8',
      },
    )
    return JSON.parse(stdout) as AgentILSRuntimeSnapshot
  }

  private withRuntimeOptions(payload: object) {
    return {
      ...(payload as Record<string, unknown>),
      stateFilePath: this.runtimeConfig.stateFilePath,
    }
  }

  private ensureRuntimeAvailable() {
    if (!existsSync(this.runtimeConfig.controlPlaneModulePath)) {
      throw new Error(
        `AgentILS runtime module was not found at ${this.runtimeConfig.controlPlaneModulePath}. Run the root build first.`,
      )
    }
  }
}
