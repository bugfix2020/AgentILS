import { writeFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import * as vscode from 'vscode'

let logFilePath: string | null = null

export function initLogger() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
  if (!workspaceFolder) {
    console.error('[agentils-logger] No workspace folder, logging disabled')
    return
  }
  logFilePath = join(workspaceFolder.uri.fsPath, '.data', 'agentils-vscode.log')
  try {
    mkdirSync(dirname(logFilePath), { recursive: true })
    // Truncate on activation so each session starts clean
    writeFileSync(logFilePath, '')
  } catch (err) {
    console.error('[agentils-logger] initLogger failed:', err)
  }
  log('logger', 'Logger initialised', { logFilePath })
}

export function log(tag: string, message: string, data?: unknown) {
  if (!logFilePath) {
    return
  }
  const ts = new Date().toISOString()
  const line = data !== undefined
    ? `[${ts}] [${tag}] ${message} ${JSON.stringify(data)}\n`
    : `[${ts}] [${tag}] ${message}\n`
  try {
    appendFileSync(logFilePath, line)
  } catch (err) {
    console.error('[agentils-logger] write failed:', err)
  }
}
