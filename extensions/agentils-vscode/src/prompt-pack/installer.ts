import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import * as vscode from 'vscode'
import { loadAgentILSPromptPack } from './template-loader'

function resolveUserPromptsDir() {
  const userDataPath =
    process.env.APPDATA ||
    (process.platform === 'darwin'
      ? join(homedir(), 'Library', 'Application Support')
      : join(homedir(), '.config'))
  const codeFolder = vscode.env.appName.includes('Insiders') ? 'Code - Insiders' : 'Code'

  return join(userDataPath, codeFolder, 'User', 'prompts')
}

export interface AgentILSPromptPackInstallResult {
  promptsDir: string
  writtenFiles: string[]
  overwrittenFiles: string[]
  skippedFiles: string[]
}

export function installAgentILSPromptPack(extensionRootPath: string): AgentILSPromptPackInstallResult {
  const promptsDir = resolveUserPromptsDir()
  const templates = loadAgentILSPromptPack(extensionRootPath)

  mkdirSync(promptsDir, { recursive: true })

  const writtenFiles: string[] = []
  const overwrittenFiles: string[] = []
  const skippedFiles: string[] = []

  for (const template of templates) {
    const targetPath = join(promptsDir, template.name)
    const nextContent = template.content.replace(/\r\n/g, '\n')
    if (existsSync(targetPath)) {
      const currentContent = readFileSync(targetPath, 'utf8').replace(/\r\n/g, '\n')
      if (currentContent === nextContent) {
        skippedFiles.push(targetPath)
        continue
      }
      overwrittenFiles.push(targetPath)
    }
    writeFileSync(targetPath, nextContent, 'utf8')
    writtenFiles.push(targetPath)
  }

  return {
    promptsDir,
    writtenFiles,
    overwrittenFiles,
    skippedFiles,
  }
}
