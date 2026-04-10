import * as vscode from 'vscode'
import { COMMANDS, OUTPUT_CHANNEL } from './constants.js'
import { installPromptTemplate, listLocalPrompts } from './local-prompts.js'
import { openLocalFile, readLocalFile } from './local-files.js'

function registerJsonCommand(context, command, handler) {
  const disposable = vscode.commands.registerCommand(command, async (...args) => {
    try {
      return await handler(...args)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      vscode.window.showErrorMessage(`AgentILS UI Helper failed: ${message}`)
      throw error
    }
  })

  context.subscriptions.push(disposable)
  return disposable
}

function createStatusItem() {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 120)
  status.text = 'AgentILS UI'
  status.tooltip = 'AgentILS UI Helper is active in this remote window'
  status.command = COMMANDS.getLocalPrompts
  return status
}

export function activate(context) {
  const output = vscode.window.createOutputChannel(OUTPUT_CHANNEL)
  context.subscriptions.push(output)

  if (!vscode.env.remoteName) {
    output.appendLine('[agentils-ui-helper] inactive: no remote window detected')
    return {
      active: false,
      remoteName: null,
    }
  }

  output.appendLine(`[agentils-ui-helper] active in remote window: ${vscode.env.remoteName}`)

  const status = createStatusItem()
  status.show()
  context.subscriptions.push(status)

  registerJsonCommand(context, COMMANDS.getLocalPrompts, async () => {
    const payload = await listLocalPrompts()
    output.appendLine(`[agentils-ui-helper] scanned ${payload.promptFiles.length} prompt files`)
    return payload
  })

  registerJsonCommand(context, COMMANDS.readLocalFile, async (input) => {
    const payload = await readLocalFile(input)
    output.appendLine(`[agentils-ui-helper] read file: ${payload.filePath ?? 'n/a'}`)
    return payload
  })

  registerJsonCommand(context, COMMANDS.openLocalFile, async (input) => {
    const payload = await openLocalFile(input)
    output.appendLine(`[agentils-ui-helper] opened file: ${payload.filePath ?? 'n/a'}`)
    return payload
  })

  registerJsonCommand(context, COMMANDS.installPromptTemplate, async (input = {}) => {
    const payload = await installPromptTemplate(input)
    if (payload.installed) {
      output.appendLine(`[agentils-ui-helper] installed template: ${payload.filePath}`)
      vscode.window.showInformationMessage(`Installed AgentILS template at ${payload.filePath}`)
    } else if (payload.skipped) {
      output.appendLine(`[agentils-ui-helper] template already exists: ${payload.filePath}`)
    } else {
      output.appendLine(`[agentils-ui-helper] template install skipped: ${payload.reason ?? 'unknown reason'}`)
    }
    return payload
  })

  return {
    active: true,
    remoteName: vscode.env.remoteName,
    commands: COMMANDS,
  }
}

export function deactivate() {}
