import { existsSync } from 'node:fs'
import { join } from 'node:path'
import * as vscode from 'vscode'
import { log } from './logger'
import { getLocalToolRequestOptions } from './runtime-client/request-options'
import type {
  AcceptOverrideInput,
  AgentILSApprovalRequestInput,
  AgentILSConversationSnapshot,
  AgentILSElicitationHandler,
  AgentILSFinishConversationResult,
  AgentILSFeedbackRequestInput,
  AgentILSFeedbackResult,
  AgentILSSessionAssistantMessageInput,
  AgentILSSessionConsumeUserMessageInput,
  AgentILSSessionFinishInput,
  AgentILSSessionState,
  AgentILSSessionToolEventInput,
  AgentILSSessionUserMessageInput,
  AgentILSApprovalResult,
  AgentILSClarificationRequestInput,
  AgentILSClarificationResult,
  AgentILSRecordApprovalInput,
  AgentILSRecordFeedbackInput,
  AgentILSRuntimeSnapshot,
  AgentILSStartTaskGateInput,
  AgentILSTaskSummaryDocument,
  ContinueTaskInput,
  MarkTaskDoneInput,
  StartTaskInput,
} from './model'

type McpClient = any
type McpTransport = any

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
    session: null,
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

function ensureWorkspaceRoot(): string {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
  if (!workspaceFolder) {
    throw new Error('AgentILS requires an open workspace folder.')
  }
  return workspaceFolder.uri.fsPath
}

function resolveDefaultServerModulePath(context: vscode.ExtensionContext, workspaceRoot: string): string {
  const extensionRelativePath = join(context.extensionPath, '..', '..', 'packages', 'mcp', 'dist', 'index.js')
  if (existsSync(extensionRelativePath)) {
    return extensionRelativePath
  }

  const workspacePackagePath = join(workspaceRoot, 'packages', 'mcp', 'dist', 'index.js')
  if (existsSync(workspacePackagePath)) {
    return workspacePackagePath
  }

  return join(workspaceRoot, 'dist', 'index.js')
}

function parseToolTextPayload<T>(result: { content?: Array<{ type?: string; text?: string }>; isError?: boolean }): T {
  const textPart = result.content?.find((item) => item.type === 'text' && typeof item.text === 'string')
  if (!textPart?.text) {
    throw new Error('AgentILS MCP tool returned no text payload.')
  }

  const separatorIndex = textPart.text.indexOf('\n')
  if (separatorIndex < 0) {
    throw new Error('AgentILS MCP tool returned an invalid text payload.')
  }

  if (result.isError) {
    throw new Error(textPart.text.slice(separatorIndex + 1).trim() || textPart.text)
  }

  return JSON.parse(textPart.text.slice(separatorIndex + 1)) as T
}

function buildSpawnEnv(stateFilePath: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') {
      env[key] = value
    }
  }
  env.AGENTILS_STATE_FILE = stateFilePath
  return env
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
  constructor(serverModulePath: string, cause?: unknown) {
    const causeText = cause instanceof Error ? cause.message : String(cause ?? 'Unknown error')
    super(
      `AgentILS local runtime is unavailable. Expected built MCP server at ` +
        `${serverModulePath}. Run "pnpm run build" first. Cause: ${causeText}`,
    )
    this.name = 'AgentILSRuntimeLocalError'
    this.cause = cause instanceof Error ? cause : undefined
  }
}

export interface AgentILSTaskServiceClient extends vscode.Disposable {
  readonly onDidChange: vscode.Event<AgentILSRuntimeSnapshot>
  snapshot(): AgentILSRuntimeSnapshot
  refresh(): Promise<AgentILSRuntimeSnapshot>
  startTask(input: StartTaskInput): Promise<AgentILSRuntimeSnapshot>
  startTaskGate(input: AgentILSStartTaskGateInput): Promise<AgentILSRuntimeSnapshot>
  continueTask(input?: ContinueTaskInput): Promise<AgentILSRuntimeSnapshot | null>
  markTaskDone(input?: MarkTaskDoneInput): Promise<AgentILSRuntimeSnapshot | null>
  acceptOverride(input: AcceptOverrideInput): Promise<AgentILSRuntimeSnapshot | null>
  beginApproval(input: AgentILSApprovalRequestInput): Promise<AgentILSRuntimeSnapshot>
  requestClarification(input: AgentILSClarificationRequestInput): Promise<AgentILSClarificationResult>
  requestFeedback(input: AgentILSFeedbackRequestInput): Promise<AgentILSFeedbackResult>
  requestApproval(input: AgentILSApprovalRequestInput): Promise<AgentILSApprovalResult>
  recordApproval(input: AgentILSRecordApprovalInput): Promise<AgentILSRuntimeSnapshot>
  recordFeedback(input: AgentILSRecordFeedbackInput): Promise<AgentILSRuntimeSnapshot>
  finishConversation(input?: { preferredRunId?: string }): Promise<AgentILSFinishConversationResult>
  getSession(preferredRunId?: string, preferredSessionId?: string): Promise<AgentILSSessionState | null>
  appendSessionUserMessage(input: AgentILSSessionUserMessageInput): Promise<AgentILSSessionState>
  appendSessionAssistantMessage(input: AgentILSSessionAssistantMessageInput): Promise<AgentILSSessionState>
  appendSessionToolEvent(input: AgentILSSessionToolEventInput): Promise<AgentILSSessionState>
  consumeSessionUserMessage(input: AgentILSSessionConsumeUserMessageInput): Promise<AgentILSSessionState>
  finishSession(input?: AgentILSSessionFinishInput): Promise<AgentILSSessionState>
  getSummaryDocument(taskId?: string | null): AgentILSTaskSummaryDocument | null
  openSummaryDocument(taskId?: string | null): Promise<vscode.Uri | null>
  setElicitationHandler(handler: AgentILSElicitationHandler | undefined): void
}

export class RepoBackedAgentILSTaskServiceClient implements AgentILSTaskServiceClient {
  private readonly emitter = new vscode.EventEmitter<AgentILSRuntimeSnapshot>()
  private readonly workspaceRoot: string
  private readonly serverModulePath: string
  private readonly stateFilePath: string
  private currentSnapshot: AgentILSRuntimeSnapshot
  private localClient: McpClient | null = null
  private localTransport: McpTransport | null = null
  private elicitationHandler: AgentILSElicitationHandler | undefined

  readonly onDidChange = this.emitter.event

  constructor(context: vscode.ExtensionContext) {
    this.workspaceRoot = ensureWorkspaceRoot()
    this.serverModulePath = resolveConfigPath(
      'runtime.serverModulePath',
      resolveDefaultServerModulePath(context, this.workspaceRoot),
    )
    this.stateFilePath = resolveConfigPath('runtime.stateFilePath', join(this.workspaceRoot, '.data/agentils-state.json'))
    this.currentSnapshot = createEmptySnapshot()
  }

  dispose() {
    this.emitter.dispose()
    void this.closeLocalClient()
  }

  snapshot(): AgentILSRuntimeSnapshot {
    return this.currentSnapshot
  }

  setElicitationHandler(handler: AgentILSElicitationHandler | undefined) {
    this.elicitationHandler = handler
  }

  async refresh(): Promise<AgentILSRuntimeSnapshot> {
    const snapshot = await this.invokeSnapshotTool<AgentILSRuntimeSnapshot>(
      'ui_runtime_snapshot_get',
      {},
      'buildUiRuntimeSnapshot',
    )
    this.applySnapshot(snapshot)
    return snapshot
  }

  async startTask(input: StartTaskInput): Promise<AgentILSRuntimeSnapshot> {
    const snapshot = await this.invokeSnapshotTool<AgentILSRuntimeSnapshot>('ui_task_start', input, 'startUiTask')
    this.applySnapshot(snapshot)
    return snapshot
  }

  async startTaskGate(input: AgentILSStartTaskGateInput): Promise<AgentILSRuntimeSnapshot> {
    const snapshot = await this.invokeLocalTool<AgentILSRuntimeSnapshot>('ui_task_start_gate', input)
    this.applySnapshot(snapshot)
    return snapshot
  }

  async continueTask(input: ContinueTaskInput = {}): Promise<AgentILSRuntimeSnapshot | null> {
    const snapshot = await this.invokeSnapshotTool<AgentILSRuntimeSnapshot>('ui_task_continue', input, 'continueUiTask')
    this.applySnapshot(snapshot)
    return snapshot
  }

  async markTaskDone(input: MarkTaskDoneInput = {}): Promise<AgentILSRuntimeSnapshot | null> {
    const snapshot = await this.invokeSnapshotTool<AgentILSRuntimeSnapshot>('ui_task_done', input, 'markUiTaskDone')
    this.applySnapshot(snapshot)
    return snapshot
  }

  async acceptOverride(input: AcceptOverrideInput): Promise<AgentILSRuntimeSnapshot | null> {
    const snapshot = await this.invokeSnapshotTool<AgentILSRuntimeSnapshot>('ui_override_accept', input, 'acceptUiOverride')
    this.applySnapshot(snapshot)
    return snapshot
  }

  async beginApproval(input: AgentILSApprovalRequestInput): Promise<AgentILSRuntimeSnapshot> {
    const snapshot = await this.invokeSnapshotTool<AgentILSRuntimeSnapshot>('ui_approval_begin', input, 'beginUiApproval')
    this.applySnapshot(snapshot)
    return snapshot
  }

  async requestClarification(input: AgentILSClarificationRequestInput): Promise<AgentILSClarificationResult> {
    const result = await this.invokeLocalTool<AgentILSClarificationResult>('clarification_request', input)
    await this.refresh()
    return result
  }

  async requestFeedback(input: AgentILSFeedbackRequestInput): Promise<AgentILSFeedbackResult> {
    const result = await this.invokeLocalTool<AgentILSFeedbackResult>('feedback_gate', input)
    await this.refresh()
    return result
  }

  async requestApproval(input: AgentILSApprovalRequestInput): Promise<AgentILSApprovalResult> {
    const result = await this.invokeLocalTool<AgentILSApprovalResult>('approval_request', input)
    await this.refresh()
    return result
  }

  async recordApproval(input: AgentILSRecordApprovalInput): Promise<AgentILSRuntimeSnapshot> {
    const snapshot = await this.invokeSnapshotTool<AgentILSRuntimeSnapshot>(
      'ui_approval_record',
      {
        preferredRunId: input.preferredRunId,
        summary: input.summary,
        action: input.action,
        status: input.status === 'cancel' ? undefined : input.status,
        message: input.message,
      },
      'recordUiApproval',
    )
    this.applySnapshot(snapshot)
    return snapshot
  }

  async recordFeedback(input: AgentILSRecordFeedbackInput): Promise<AgentILSRuntimeSnapshot> {
    const snapshot = await this.invokeSnapshotTool<AgentILSRuntimeSnapshot>(
      'ui_feedback_record',
      {
        preferredRunId: input.preferredRunId,
        status: input.status === 'cancel' ? 'continue' : input.status,
        message: input.message,
      },
      'recordUiFeedback',
    )
    this.applySnapshot(snapshot)
    return snapshot
  }

  async finishConversation(input: { preferredRunId?: string } = {}): Promise<AgentILSFinishConversationResult> {
    const result = await this.invokeRuntime<AgentILSFinishConversationResult>(
      'ui_conversation_finish',
      input,
      'finishUiConversation',
    )
    this.applySnapshot(result.snapshot)
    return result
  }

  async getSession(preferredRunId?: string, preferredSessionId?: string): Promise<AgentILSSessionState | null> {
    return this.invokeLocalTool<AgentILSSessionState | null>('ui_session_get', {
      preferredRunId,
      preferredSessionId,
    })
  }

  async appendSessionUserMessage(input: AgentILSSessionUserMessageInput): Promise<AgentILSSessionState> {
    const snapshot = await this.invokeLocalTool<AgentILSRuntimeSnapshot>('ui_session_append_user_message', input)
    this.applySnapshot(snapshot)
    return snapshot.session!
  }

  async appendSessionAssistantMessage(input: AgentILSSessionAssistantMessageInput): Promise<AgentILSSessionState> {
    const snapshot = await this.invokeLocalTool<AgentILSRuntimeSnapshot>('ui_session_append_assistant_message', input)
    this.applySnapshot(snapshot)
    return snapshot.session!
  }

  async appendSessionToolEvent(input: AgentILSSessionToolEventInput): Promise<AgentILSSessionState> {
    const snapshot = await this.invokeLocalTool<AgentILSRuntimeSnapshot>('ui_session_append_tool_event', input)
    this.applySnapshot(snapshot)
    return snapshot.session!
  }

  async consumeSessionUserMessage(input: AgentILSSessionConsumeUserMessageInput): Promise<AgentILSSessionState> {
    const snapshot = await this.invokeLocalTool<AgentILSRuntimeSnapshot>('ui_session_consume_user_message', input)
    this.applySnapshot(snapshot)
    return snapshot.session!
  }

  async finishSession(input: AgentILSSessionFinishInput = {}): Promise<AgentILSSessionState> {
    const result = await this.invokeLocalTool<AgentILSFinishConversationResult>('ui_session_finish', input)
    this.applySnapshot(result.snapshot)
    return result.snapshot.session!
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

  private applySnapshot(snapshot: AgentILSRuntimeSnapshot) {
    log('client', 'applySnapshot', {
      hasSession: !!snapshot.session,
      sessionId: snapshot.session?.sessionId,
      sessionStatus: snapshot.session?.status,
      messageCount: snapshot.session?.messages?.length ?? 0,
      queuedCount: snapshot.session?.queuedUserMessageIds?.length ?? 0,
    })
    this.currentSnapshot = snapshot
    this.emitter.fire(snapshot)
  }

  private async invokeSnapshotTool<T>(toolName: string, payload: object, httpAction: string): Promise<T> {
    return this.invokeRuntime<T>(toolName, payload, httpAction)
  }

  private async invokeRuntime<T>(toolName: string, payload: object, httpAction: string): Promise<T> {
    log('client', `invokeRuntime: ${toolName}`)
    const baseUrl = resolveRuntimeBaseUrl()
    if (baseUrl) {
      return this.invokeHttp<T>(httpAction, payload, baseUrl)
    }
    return this.invokeLocalTool<T>(toolName, payload)
  }

  private async invokeLocalTool<T>(toolName: string, payload: object): Promise<T> {
    this.ensureLocalRuntimeAvailable()
    const client = await this.ensureLocalClient()
    try {
      const requestOptions = getLocalToolRequestOptions(toolName)
      const result = await client.callTool({
        name: toolName,
        arguments: payload,
      }, undefined, requestOptions)
      return parseToolTextPayload<T>(result)
    } catch (error) {
      throw new AgentILSRuntimeLocalError(this.serverModulePath, error)
    }
  }

  private async ensureLocalClient(): Promise<McpClient> {
    if (this.localClient) {
      return this.localClient
    }

    let Client: any
    let StdioClientTransport: any
    let ElicitRequestSchema: any
    try {
      Client = require('@modelcontextprotocol/sdk/client/index.js').Client
      StdioClientTransport = require('@modelcontextprotocol/sdk/client/stdio.js').StdioClientTransport
      ElicitRequestSchema = require('@modelcontextprotocol/sdk/types.js').ElicitRequestSchema
    } catch (error) {
      throw new AgentILSRuntimeLocalError(this.serverModulePath, error)
    }

    this.localTransport = new StdioClientTransport({
      command: 'node',
      args: [this.serverModulePath],
      cwd: this.workspaceRoot,
      env: buildSpawnEnv(this.stateFilePath),
      stderr: 'pipe',
    })

    if (this.localTransport.stderr) {
      this.localTransport.stderr.on('data', (chunk: Buffer | string) => {
        const stderrText = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
        if (stderrText.trim().length > 0) {
          log('client', 'mcp stderr', { stderr: stderrText.trim() })
        }
      })
    }

    this.localClient = new Client(
      { name: 'agentils-vscode-runtime-client', version: '0.1.0' },
      { capabilities: { elicitation: {} } },
    )

    this.localClient.setRequestHandler(
      ElicitRequestSchema,
      async (request: { params?: Record<string, unknown> }) => {
        if (!this.elicitationHandler) {
          return {
            action: 'cancel',
            content: null,
          }
        }
        return this.elicitationHandler(request.params ?? {})
      },
    )

    try {
      await this.localClient.connect(this.localTransport)
      log('client', 'Local MCP runtime client connected', { serverModulePath: this.serverModulePath })
      return this.localClient
    } catch (error) {
      this.localClient = null
      this.localTransport = null
      throw new AgentILSRuntimeLocalError(this.serverModulePath, error)
    }
  }

  private async closeLocalClient() {
    if (this.localClient) {
      try {
        await this.localClient.close()
      } catch {
        // best effort
      }
    }
    this.localClient = null
    this.localTransport = null
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
        body: JSON.stringify({
          ...(payload as Record<string, unknown>),
          stateFilePath: this.stateFilePath,
        }),
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

  private ensureLocalRuntimeAvailable() {
    if (!existsSync(this.serverModulePath)) {
      throw new AgentILSRuntimeLocalError(this.serverModulePath)
    }
  }
}
