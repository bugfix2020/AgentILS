import * as vscode from 'vscode'
import type { TaskConsoleComposerMode } from './panel/task-console-protocol'
import type { ConversationSessionManager } from './session/conversation-session-manager'

export function registerAgentILSCommands(
  context: vscode.ExtensionContext,
  sessionManager: ConversationSessionManager,
  openConsole: (composerMode?: TaskConsoleComposerMode) => void,
) {
  const register = (command: string, handler: (...args: any[]) => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(command, handler))

  register('agentils.openTaskConsole', () => {
    openConsole('newTask')
  })

  register('agentils.newTask', async () => {
    openConsole('newTask')
  })

  register('agentils.continueTask', async () => {
    openConsole('continueTask')
  })

  register('agentils.markTaskDone', async () => {
    openConsole('markTaskDone')
  })

  register('agentils.acceptOverride', async () => {
    openConsole('acceptOverride')
  })

  register('agentils.openSummary', async () => {
    const summary = sessionManager.getSummaryDocument()
    if (!summary) {
      vscode.window.showInformationMessage('No task summary has been generated yet.')
      return
    }

    const uri = vscode.Uri.file(summary.filePath)
    const document = await vscode.workspace.openTextDocument(uri)
    await vscode.window.showTextDocument(document, { preview: false })
  })
}
