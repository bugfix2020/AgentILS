import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import * as vscode from 'vscode'

const execFileAsync = promisify(execFile)

function resolveCliEntrypoint(context: vscode.ExtensionContext): string | null {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
  const candidates = [
    join(context.extensionUri.fsPath, '..', '..', 'packages', 'cli', 'dist', 'index.js'),
    workspaceFolder ? join(workspaceFolder.uri.fsPath, 'packages', 'cli', 'dist', 'index.js') : null,
  ]

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

export function registerAgentILSPromptPackCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('agentils.installPromptPack', async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
      if (!workspaceFolder) {
        await vscode.window.showErrorMessage('AgentILS install requires an open workspace folder.')
        return
      }

      const cliEntrypoint = resolveCliEntrypoint(context)
      if (!cliEntrypoint) {
        await vscode.window.showErrorMessage('AgentILS CLI is not built. Run "pnpm build" in the workspace first.')
        return
      }

      try {
        const { stdout } = await execFileAsync(
          process.execPath,
          [
            cliEntrypoint,
            'inject',
            'vscode',
            '--workspace',
            workspaceFolder.uri.fsPath,
          ],
          {
            cwd: workspaceFolder.uri.fsPath,
            encoding: 'utf8',
          },
        )

        const summary = stdout
          .trim()
          .split('\n')
          .filter(Boolean)
          .slice(-4)
          .join('\n')

        await vscode.window.showInformationMessage(
          summary.length > 0 ? `AgentILS install completed.\n${summary}` : 'AgentILS install completed.',
        )
      } catch (error) {
        await vscode.window.showErrorMessage(
          error instanceof Error ? error.message : 'Failed to run the AgentILS CLI installer.',
        )
      }
    }),
  )
}
