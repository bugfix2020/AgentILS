import * as vscode from 'vscode'
import type { StartTaskInput } from './model'
import { renderTaskConsoleHtml } from './panel/task-console-renderer'
import type { TaskConsoleComposerMode, TaskConsoleMessage } from './panel/task-console-protocol'
import { log } from './logger'
import { ConversationSessionManager } from './session/conversation-session-manager'

export type { TaskConsoleComposerMode } from './panel/task-console-protocol'

export class TaskConsolePanel implements vscode.Disposable {
  private static currentPanel: TaskConsolePanel | null = null

  static createOrShow(
    extensionUri: vscode.Uri,
    sessionManager: ConversationSessionManager,
    composerMode: TaskConsoleComposerMode = 'newTask',
    onDispose?: () => void,
  ) {
    if (TaskConsolePanel.currentPanel) {
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
        localResourceRoots: [extensionUri],
      },
    )

    log('panel', 'TaskConsolePanel created')
    TaskConsolePanel.currentPanel = new TaskConsolePanel(panel, sessionManager, composerMode, onDispose)
    return TaskConsolePanel.currentPanel
  }

  private readonly disposables: vscode.Disposable[] = []

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly sessionManager: ConversationSessionManager,
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

    this.render()
  }

  dispose() {
    TaskConsolePanel.currentPanel = null
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
    this.panel.webview.html = renderTaskConsoleHtml(this.sessionManager.snapshot(), this.composerMode)
  }

  private async handleMessage(message: unknown) {
    if (!message || typeof message !== 'object') {
      return
    }

    const payload = message as TaskConsoleMessage
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
        controlMode: 'normal',
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
