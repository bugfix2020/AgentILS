import * as vscode from 'vscode'
import type { AgentILSControlMode, StartTaskInput } from './model'
import { TaskConsolePanel } from './task-console-panel'
import type { AgentILSTaskServiceClient } from './task-service-client'

async function promptForControlMode(): Promise<AgentILSControlMode> {
  const choice = await vscode.window.showQuickPick<AgentILSControlMode>(['normal', 'alternate', 'direct'], {
    placeHolder: 'Choose the control mode for this task',
  })
  return choice ?? 'normal'
}

async function promptForTaskInput(): Promise<StartTaskInput | null> {
  const title = await vscode.window.showInputBox({
    title: 'AgentILS New Task',
    prompt: 'Task title',
    ignoreFocusOut: true,
  })
  if (!title?.trim()) {
    return null
  }

  const goal = await vscode.window.showInputBox({
    title: 'AgentILS New Task',
    prompt: 'Task goal',
    ignoreFocusOut: true,
  })
  if (!goal?.trim()) {
    return null
  }

  const mode = await promptForControlMode()

  return {
    title: title.trim(),
    goal: goal.trim(),
    controlMode: mode,
  }
}

async function promptForText(title: string, prompt: string): Promise<string | null> {
  const value = await vscode.window.showInputBox({
    title,
    prompt,
    ignoreFocusOut: true,
  })
  return value?.trim() ? value.trim() : null
}

export function registerAgentILSCommands(
  context: vscode.ExtensionContext,
  client: AgentILSTaskServiceClient,
  openConsole: () => void,
) {
  const register = (command: string, handler: (...args: any[]) => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(command, handler))

  register('agentils.openTaskConsole', () => {
    openConsole()
  })

  register('agentils.newTask', async () => {
    const input = await promptForTaskInput()
    if (!input) {
      return
    }

    try {
      await client.startTask(input)
      openConsole()
      vscode.window.showInformationMessage(`AgentILS started task "${input.title}".`)
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Failed to start a new task.')
    }
  })

  register('agentils.continueTask', async () => {
    const note = await promptForText('AgentILS Continue Task', 'Optional continuation note')
    const snapshot = await client.continueTask(note ? { note } : {})
    if (!snapshot?.activeTask) {
      vscode.window.showWarningMessage('No active task to continue.')
      return
    }
    openConsole()
  })

  register('agentils.markTaskDone', async () => {
    const summary = await promptForText('AgentILS Mark Task Done', 'Optional completion summary')
    const snapshot = await client.markTaskDone(summary ? { summary } : {})
    if (!snapshot) {
      vscode.window.showWarningMessage('No active task to mark as done.')
      return
    }
    openConsole()
    vscode.window.showInformationMessage('AgentILS marked the current task as done.')
  })

  register('agentils.acceptOverride', async () => {
    const acknowledgement = await promptForText(
      'AgentILS Accept Override',
      'Type the risk acknowledgement text to continue in override mode',
    )
    if (!acknowledgement) {
      return
    }

    const snapshot = await client.acceptOverride({ acknowledgement })
    if (!snapshot) {
      vscode.window.showWarningMessage('No active task available for override acknowledgement.')
      return
    }
    openConsole()
    vscode.window.showInformationMessage('AgentILS override acknowledgement recorded.')
  })

  register('agentils.openSummary', async () => {
    const summary = client.getSummaryDocument()
    if (!summary) {
      vscode.window.showInformationMessage('No task summary has been generated yet.')
      return
    }

    const uri = vscode.Uri.file(summary.filePath)
    const document = await vscode.workspace.openTextDocument(uri)
    await vscode.window.showTextDocument(document, { preview: false })
  })
}
