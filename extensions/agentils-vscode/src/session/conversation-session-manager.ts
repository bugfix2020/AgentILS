import { randomUUID } from 'node:crypto'
import * as vscode from 'vscode'
import type {
  AcceptOverrideInput,
  AgentILSApprovalRequestInput,
  AgentILSApprovalResult,
  AgentILSClarificationRequestInput,
  AgentILSClarificationResult,
  AgentILSFeedbackRequestInput,
  AgentILSFeedbackResult,
  AgentILSPanelState,
  AgentILSPendingInteraction,
  AgentILSRecordApprovalInput,
  AgentILSRecordFeedbackInput,
  ContinueTaskInput,
  MarkTaskDoneInput,
  StartTaskInput,
} from '../model'
import type { AgentILSInteractionChannel } from '../interaction-channel/types'
import type { TaskConsoleComposerMode } from '../panel/task-console-protocol'
import type { AgentILSTaskServiceClient } from '../task-service-client'
import { log } from '../logger'
import { PendingInteractionRegistry } from './pending-interaction-registry'

function nowIso() {
  return new Date().toISOString()
}

function createRequestId(kind: string) {
  return `${kind}_${randomUUID()}`
}

export class ConversationSessionManager implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<AgentILSPanelState>()
  private readonly registry = new PendingInteractionRegistry()
  private readonly disposables: vscode.Disposable[] = []
  private interactionChannel?: AgentILSInteractionChannel

  readonly onDidChange = this.emitter.event

  constructor(private readonly client: AgentILSTaskServiceClient) {
    this.disposables.push(
      this.client.onDidChange(() => this.emitChange()),
      this.registry.onDidChange(() => this.emitChange()),
    )
  }

  dispose() {
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose()
    }
    this.registry.dispose()
    this.emitter.dispose()
  }

  setInteractionChannel(interactionChannel: AgentILSInteractionChannel) {
    this.interactionChannel = interactionChannel
  }

  snapshot(): AgentILSPanelState {
    const runtimeSnapshot = this.client.snapshot()
    return {
      snapshot: runtimeSnapshot,
      pendingInteraction: this.registry.snapshot(),
      controlMode: runtimeSnapshot.activeTask?.controlMode,
      overrideActive: runtimeSnapshot.activeTask?.overrideState.confirmed,
    }
  }

  getSummaryDocument(taskId?: string | null) {
    return this.client.getSummaryDocument(taskId)
  }

  openSummaryDocument(taskId?: string | null) {
    return this.client.openSummaryDocument(taskId)
  }

  async refresh() {
    await this.client.refresh()
    return this.snapshot()
  }

  async startTask(input: StartTaskInput) {
    log('session', 'startTask called', { title: input.title })
    await this.client.startTask(input)
    log('session', 'startTask completed, opening console')
    this.ensureConsoleVisible('continueTask')
    return this.snapshot()
  }

  async continueTask(input: ContinueTaskInput = {}) {
    await this.client.continueTask(input)
    return this.snapshot()
  }

  async markTaskDone(input: MarkTaskDoneInput = {}) {
    await this.client.markTaskDone(input)
    return this.snapshot()
  }

  async acceptOverride(input: AcceptOverrideInput) {
    await this.client.acceptOverride(input)
    return this.snapshot()
  }

  async beginApproval(input: AgentILSApprovalRequestInput) {
    await this.client.beginApproval(input)
    return this.snapshot()
  }

  async recordApproval(input: AgentILSRecordApprovalInput) {
    await this.client.recordApproval(input)
    return this.snapshot()
  }

  async recordFeedback(input: AgentILSRecordFeedbackInput) {
    await this.client.recordFeedback(input)
    return this.snapshot()
  }

  finishConversation(preferredRunId?: string) {
    return this.client.finishConversation({ preferredRunId })
  }

  async requestClarification(input: AgentILSClarificationRequestInput): Promise<AgentILSClarificationResult> {
    log('session', 'requestClarification called', { question: input.question })
    this.ensureConsoleVisible('continueTask')
    return this.registry.begin<AgentILSClarificationResult>({
      requestId: createRequestId('clarification'),
      kind: 'clarification',
      runId: this.resolveRunId(input.preferredRunId),
      title: 'Clarification Required',
      description: [input.question, input.context].filter(Boolean).join('\n\n'),
      placeholder: input.placeholder ?? 'Provide the missing detail',
      required: input.required ?? true,
    })
  }

  async requestFeedback(input: AgentILSFeedbackRequestInput): Promise<AgentILSFeedbackResult> {
    log('session', 'requestFeedback called', { question: input.question })
    this.ensureConsoleVisible('markTaskDone')
    return this.registry.begin<AgentILSFeedbackResult>({
      requestId: createRequestId('feedback'),
      kind: 'feedback',
      runId: this.resolveRunId(input.preferredRunId),
      title: 'Feedback Required',
      description: [input.question, input.summary].filter(Boolean).join('\n\n'),
      placeholder: 'Add optional feedback notes',
      required: false,
      options: (input.allowedActions ?? ['continue', 'done', 'revise']).map((value) => ({
        label: value,
        value,
      })),
      summary: input.summary,
    })
  }

  async requestApproval(input: AgentILSApprovalRequestInput): Promise<AgentILSApprovalResult> {
    log('session', 'requestApproval called', { summary: input.summary, riskLevel: input.riskLevel })
    this.ensureConsoleVisible('acceptOverride')
    return this.registry.begin<AgentILSApprovalResult>({
      requestId: createRequestId('approval'),
      kind: 'approval',
      runId: this.resolveRunId(input.preferredRunId),
      title: 'Approval Required',
      description: input.summary,
      placeholder: 'Add optional approval notes',
      required: false,
      options: [
        { label: 'Accept', value: 'accept' },
        { label: 'Decline', value: 'decline' },
        { label: 'Cancel', value: 'cancel' },
      ],
      summary: input.summary,
      riskLevel: input.riskLevel,
      targets: input.targets ?? [],
    })
  }

  submitClarification(requestId: string, content: string) {
    this.registry.resolve(requestId, {
      status: 'submitted',
      content,
      requestId,
      traceId: `clarification_${randomUUID()}`,
      recordedAt: nowIso(),
    } satisfies AgentILSClarificationResult)
  }

  cancelClarification(requestId: string) {
    this.registry.resolve(requestId, {
      status: 'cancelled',
      content: '',
      requestId,
      traceId: `clarification_${randomUUID()}`,
      recordedAt: nowIso(),
    } satisfies AgentILSClarificationResult)
  }

  submitFeedback(requestId: string, status: AgentILSFeedbackResult['status'], message: string) {
    this.registry.resolve(requestId, {
      status,
      message,
      requestId,
      traceId: `feedback_${randomUUID()}`,
      recordedAt: nowIso(),
    } satisfies AgentILSFeedbackResult)
  }

  cancelFeedback(requestId: string) {
    this.submitFeedback(requestId, 'cancel', '')
  }

  submitApproval(
    requestId: string,
    action: AgentILSApprovalResult['action'],
    status: AgentILSApprovalResult['status'],
    message: string,
  ) {
    this.registry.resolve(requestId, {
      action,
      status,
      message,
      requestId,
      traceId: `approval_${randomUUID()}`,
      recordedAt: nowIso(),
    } satisfies AgentILSApprovalResult)
  }

  cancelApproval(requestId: string) {
    this.submitApproval(requestId, 'cancel', 'cancel', '')
  }

  cancelPendingInteractionFromPanel() {
    const pending = this.registry.snapshot()
    if (!pending) {
      return
    }

    if (pending.kind === 'clarification') {
      this.cancelClarification(pending.requestId)
      return
    }

    if (pending.kind === 'feedback') {
      this.cancelFeedback(pending.requestId)
      return
    }

    this.cancelApproval(pending.requestId)
  }

  private emitChange() {
    this.emitter.fire(this.snapshot())
  }

  private ensureConsoleVisible(composerMode: TaskConsoleComposerMode) {
    log('session', 'ensureConsoleVisible', { composerMode, hasChannel: !!this.interactionChannel })
    this.interactionChannel?.revealConsole(composerMode)
  }

  private resolveRunId(preferredRunId?: string) {
    return preferredRunId ?? this.client.snapshot().activeTask?.runId ?? null
  }
}
