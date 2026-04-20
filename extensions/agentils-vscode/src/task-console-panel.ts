import * as vscode from 'vscode'
import type { StartTaskInput } from './model'
import { renderTaskConsoleHtml } from './panel/task-console-renderer'
import type { TaskConsoleComposerMode, TaskConsoleMessage } from './panel/task-console-protocol'
import { log } from './logger'
import { JsonlLogger } from './jsonl-logger'
import { ConversationSessionManager } from './session/conversation-session-manager'

export type { TaskConsoleComposerMode } from './panel/task-console-protocol'

export class TaskConsolePanel implements vscode.Disposable {
  private static currentPanel: TaskConsolePanel | null = null
  private static panels = new Set<TaskConsolePanel>()

  static createOrShow(
    extensionUri: vscode.Uri,
    sessionManager: ConversationSessionManager,
    composerMode: TaskConsoleComposerMode = 'newTask',
    onDispose?: () => void,
    forceNewPanel = false,
  ) {
    if (!forceNewPanel && TaskConsolePanel.currentPanel) {
      TaskConsolePanel.currentPanel.setComposerMode(composerMode)
      TaskConsolePanel.currentPanel.panel.reveal(vscode.ViewColumn.Active)
      return TaskConsolePanel.currentPanel
    }

    const panel = vscode.window.createWebviewPanel(
      'agentilsTaskConsole',
      'AgentILS Task Console',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri, vscode.Uri.joinPath(extensionUri, 'dist')],
      },
    )

    log('panel', 'TaskConsolePanel created', { forceNewPanel })
    const instance = new TaskConsolePanel(
      panel,
      sessionManager,
      extensionUri,
      composerMode,
      onDispose,
    )
    TaskConsolePanel.currentPanel = instance
    TaskConsolePanel.panels.add(instance)
    return instance
  }

  private readonly disposables: vscode.Disposable[] = []

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly sessionManager: ConversationSessionManager,
    private readonly extensionUri: vscode.Uri,
    private composerMode: TaskConsoleComposerMode,
    private readonly onDispose?: () => void,
  ) {
    this.disposables.push(
      this.panel.onDidDispose(() => this.dispose()),
      this.panel.webview.onDidReceiveMessage((message) => {
        void this.handleMessage(message)
      }),
      this.sessionManager.onDidChange(() => this.render()),
    )

    this.panel.webview.html = renderTaskConsoleHtml(
      this.panel.webview,
      this.extensionUri,
      this.sessionManager.snapshot(),
      this.composerMode,
    )
    void this.render()
  }

  dispose() {
    TaskConsolePanel.panels.delete(this)
    if (TaskConsolePanel.currentPanel === this) {
      TaskConsolePanel.currentPanel = null
    }
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose()
    }
    this.onDispose?.()
  }

  private setComposerMode(composerMode: TaskConsoleComposerMode) {
    this.composerMode = composerMode
    this.render()
  }

  private render() {
    const state = this.sessionManager.snapshot()
    log('panel', 'render', {
      hasSession: !!state.snapshot.session,
      sessionStatus: state.snapshot.session?.status,
      messageCount: state.snapshot.session?.messages?.length ?? 0,
    })
    void this.panel.webview.postMessage({
      type: 'stateUpdate',
      payload: state,
      composerMode: this.composerMode,
    })
  }

  private async handleMessage(message: unknown) {
    if (!message || typeof message !== 'object') {
      return
    }

    const payload = message as TaskConsoleMessage

    // 处理日志消息
    if ((payload as any).action === 'logEntry' && (payload as any).payload) {
      const entry = (payload as any).payload
      JsonlLogger.write(entry)
      return
    }

    log('panel', 'handleMessage', { action: (payload as { action?: string }).action })
    switch (payload.action) {
      case 'newTask':
        this.setComposerMode('newTask')
        return
      case 'continueTask':
        this.setComposerMode('continueTask')
        return
      case 'markTaskDone':
        this.setComposerMode('markTaskDone')
        return
      case 'acceptOverride':
        this.setComposerMode('acceptOverride')
        return
      case 'openSummary':
        await this.openSummary()
        return
      case 'submitNewTask':
        await this.submitNewTask({
          title: payload.title ?? '',
          goal: payload.goal ?? '',
          controlMode:
            'controlMode' in payload && (payload.controlMode === 'alternate' || payload.controlMode === 'direct')
              ? payload.controlMode
              : 'normal',
        })
        return
      case 'submitContinueTask':
        await this.submitContinueTask(payload.note ?? '')
        return
      case 'submitMarkTaskDone':
        await this.submitMarkTaskDone(payload.summary ?? '')
        return
      case 'submitAcceptOverride':
        await this.submitAcceptOverride(payload.acknowledgement ?? '')
        return
      case 'submitSessionMessage':
        await this.submitSessionMessage(payload.content ?? '')
        return
      case 'finishSession':
        await this.finishSession()
        return
      case 'submitPendingInteraction':
        await this.submitPendingInteraction(payload)
        return
      case 'cancelPendingInteraction':
        this.sessionManager.cancelPendingInteractionFromPanel()
        return
      case 'submitApprovalConfirm':
        if ('requestId' in payload) {
          this.sessionManager.submitApproval(payload.requestId, 'accept', 'continue', '')
        }
        return
      case 'submitApprovalDecline':
        if ('requestId' in payload) {
          this.sessionManager.submitApproval(
            payload.requestId,
            'decline',
            'cancel',
            ('reason' in payload ? (payload as { reason?: string }).reason?.trim() : '') ?? '',
          )
        }
        return
      default:
        return
    }
  }

  private async openSummary() {
    const uri = await this.sessionManager.openSummaryDocument()
    if (!uri) {
      vscode.window.showInformationMessage('No task summary has been generated yet.')
      return
    }

    const document = await vscode.workspace.openTextDocument(uri)
    await vscode.window.showTextDocument(document, { preview: false })
  }

  private async submitNewTask(input: StartTaskInput) {
    const title = input.title.trim()
    const goal = input.goal.trim()
    if (!title || !goal) {
      vscode.window.showWarningMessage('Task title and goal are required.')
      return
    }

    try {
      await this.sessionManager.startTask({
        title,
        goal,
        controlMode: input.controlMode ?? 'normal',
      })
      this.setComposerMode('continueTask')
      vscode.window.showInformationMessage(`AgentILS started task "${title}".`)
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Failed to start a new task.')
    }
  }

  private async submitContinueTask(note: string) {
    try {
      const state = await this.sessionManager.continueTask(note.trim() ? { note: note.trim() } : {})
      if (!state.snapshot.activeTask) {
        vscode.window.showWarningMessage('No active task to continue.')
      }
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Failed to continue the current task.')
    }
  }

  private async submitMarkTaskDone(summary: string) {
    try {
      const state = await this.sessionManager.markTaskDone(summary.trim() ? { summary: summary.trim() } : {})
      if (!state.snapshot.activeTask) {
        vscode.window.showInformationMessage('AgentILS marked the current task as done.')
      }
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Failed to mark the current task as done.')
    }
  }

  private async submitAcceptOverride(acknowledgement: string) {
    const message = acknowledgement.trim()
    if (!message) {
      vscode.window.showWarningMessage('Risk acknowledgement is required.')
      return
    }

    try {
      await this.sessionManager.acceptOverride({ acknowledgement: message })
      this.setComposerMode('continueTask')
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Failed to accept override.')
    }
  }

  private async submitSessionMessage(content: string) {
    const message = content.trim()
    if (!message) {
      vscode.window.showWarningMessage('Session input is required.')
      return
    }

    try {
      await this.sessionManager.submitSessionMessage(message)
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Failed to send the session message.')
    }
  }

  private async finishSession() {
    const snapshot = this.sessionManager.snapshot().snapshot
    const preferredRunId = snapshot.activeTask?.runId ?? snapshot.session?.runId ?? undefined
    const preferredSessionId = snapshot.session?.sessionId
    try {
      await this.sessionManager.finishSession(preferredRunId, preferredSessionId)
      vscode.window.showInformationMessage('AgentILS session finished.')
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Failed to finish the AgentILS session.')
    }
  }

  private async submitPendingInteraction(message: Extract<TaskConsoleMessage, { action: 'submitPendingInteraction' }>) {
    const pending = this.sessionManager.snapshot().pendingInteraction
    if (!pending || pending.requestId !== message.requestId) {
      vscode.window.showWarningMessage('The pending interaction has already changed. Please retry.')
      return
    }

    if (pending.kind === 'startTask') {
      const title = message.title?.trim() ?? ''
      const goal = message.goal?.trim() ?? ''
      if (!title || !goal) {
        vscode.window.showWarningMessage('Task title and goal are required.')
        return
      }

      const controlMode =
        message.controlMode === 'alternate' || message.controlMode === 'direct' ? message.controlMode : 'normal'
      this.sessionManager.submitTaskStart(message.requestId, title, goal, controlMode)
      return
    }

    if (pending.kind === 'clarification') {
      this.sessionManager.submitClarification(message.requestId, message.content?.trim() ?? '')
      return
    }

    if (pending.kind === 'feedback') {
      this.sessionManager.submitFeedback(
        message.requestId,
        (message.status as 'continue' | 'done' | 'revise' | 'cancel') || 'continue',
        message.message?.trim() ?? '',
      )
      return
    }

    this.sessionManager.submitApproval(
      message.requestId,
      (message.responseAction as 'accept' | 'decline' | 'cancel') || 'accept',
      (message.status as 'continue' | 'done' | 'revise' | 'cancel') || 'continue',
      message.message?.trim() ?? '',
    )
  }
}
