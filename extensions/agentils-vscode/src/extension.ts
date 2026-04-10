import * as vscode from 'vscode'
import { registerAgentILSCommands } from './commands'
import { AgentILSStatusSurface } from './status-surface'
import { TaskConsolePanel } from './task-console-panel'
import { MementoAgentILSTaskServiceClient } from './task-service-client'

export async function activate(context: vscode.ExtensionContext) {
  const storageKey =
    vscode.workspace.getConfiguration('agentils').get<string>('taskService.storageKey') ??
    'agentils.vscode.taskServiceState'

  const client = new MementoAgentILSTaskServiceClient(context, storageKey)
  const statusEnabled = vscode.workspace.getConfiguration('agentils').get<boolean>('taskConsole.showStatusBar') ?? true
  const status = new AgentILSStatusSurface(client, statusEnabled)

  const openConsole = () => {
    TaskConsolePanel.createOrShow(context.extensionUri, client)
  }

  registerAgentILSCommands(context, client, openConsole)

  context.subscriptions.push(status)
}

export function deactivate() {}
