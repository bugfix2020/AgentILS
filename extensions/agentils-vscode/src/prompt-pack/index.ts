import * as vscode from 'vscode'
import { installAgentILSPromptPack } from './installer'

export function registerAgentILSPromptPackCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('agentils.installPromptPack', async () => {
      try {
        const result = installAgentILSPromptPack(context.extensionUri.fsPath)
        await vscode.window.showInformationMessage(
          `AgentILS prompt pack installed: ${result.writtenFiles.length} files into ${result.promptsDir}.`,
        )
      } catch (error) {
        await vscode.window.showErrorMessage(
          error instanceof Error ? error.message : 'Failed to install the AgentILS prompt pack.',
        )
      }
    }),
  )
}