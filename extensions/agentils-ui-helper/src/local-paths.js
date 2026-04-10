import os from 'node:os'
import path from 'node:path'
import * as vscode from 'vscode'

export function expandHome(input) {
  if (!input) {
    return null
  }

  if (input.startsWith('~')) {
    return path.resolve(os.homedir(), input.slice(1))
  }

  return path.resolve(input)
}

export function getDefaultPromptRoots() {
  const home = os.homedir()

  if (process.platform === 'darwin') {
    return [
      path.join(home, 'Library/Application Support/Code/User/prompts'),
      path.join(home, 'Library/Application Support/Code - Insiders/User/prompts'),
    ]
  }

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(home, 'AppData/Roaming')
    return [
      path.join(appData, 'Code/User/prompts'),
      path.join(appData, 'Code - Insiders/User/prompts'),
    ]
  }

  const configHome = process.env.XDG_CONFIG_HOME ?? path.join(home, '.config')
  return [
    path.join(configHome, 'Code/User/prompts'),
    path.join(configHome, 'Code - Insiders/User/prompts'),
  ]
}

export function resolveConfiguredPromptRoots() {
  const configuration = vscode.workspace.getConfiguration('agentilsUiHelper')
  const configured = configuration.get('promptRoots', [])

  if (Array.isArray(configured) && configured.length > 0) {
    return configured.map(expandHome).filter(Boolean)
  }

  return getDefaultPromptRoots()
}

export function pickPromptRoot(preferredRoot) {
  if (preferredRoot) {
    return expandHome(preferredRoot)
  }

  const [firstRoot] = resolveConfiguredPromptRoots()
  return firstRoot ?? null
}

export function normalizeCommandPath(input) {
  if (!input) {
    return null
  }

  if (typeof input === 'string') {
    if (input.startsWith('file://')) {
      return vscode.Uri.parse(input).fsPath
    }

    return expandHome(input)
  }

  if (typeof input === 'object') {
    const candidate = input.filePath ?? input.path ?? input.uri ?? input.fsPath
    if (typeof candidate === 'string') {
      if (candidate.startsWith('file://')) {
        return vscode.Uri.parse(candidate).fsPath
      }

      return expandHome(candidate)
    }
  }

  return null
}
