import * as vscode from 'vscode'
import type { AgentILSRuntimeSnapshot } from './model'
import type { AgentILSTaskServiceClient } from './task-service-client'

export class AgentILSStatusSurface implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem
  private readonly subscription: vscode.Disposable

  constructor(
    private readonly client: AgentILSTaskServiceClient,
    enabled = true,
  ) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 120)
    this.item.command = 'agentils.openTaskConsole'
    this.item.tooltip = 'Open the AgentILS task console.'

    if (enabled) {
      this.item.show()
    }

    this.update(this.client.snapshot())
    this.subscription = this.client.onDidChange((snapshot) => this.update(snapshot))
  }

  dispose() {
    this.subscription.dispose()
    this.item.dispose()
  }

  private update(snapshot: AgentILSRuntimeSnapshot) {
    const task = snapshot.activeTask
    if (!task) {
      this.item.text = 'AgentILS: idle'
      this.item.tooltip = 'No active task. Open the task console to start one.'
      return
    }

    this.item.text = `AgentILS: ${task.controlMode} · ${task.phase}`
    this.item.tooltip = [
      `Conversation: ${snapshot.conversation.conversationId}`,
      `Task: ${task.title}`,
      `Goal: ${task.goal}`,
      `Phase: ${task.phase}`,
      `Status: ${task.status}`,
      `Open the task console for the full control surface.`,
    ].join('\n')
  }
}
