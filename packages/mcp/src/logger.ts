import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface LogEntry {
  timestamp: string
  level: 'debug' | 'info' | 'warn' | 'error'
  source: 'webview' | 'extension' | 'mcp'
  module: string
  event: string
  [key: string]: unknown
}

export class JsonlLogger {
  private static isEnabled = process.env.AGENTILS_DEBUG === 'true'
  private static logsDir = join(homedir(), '.agentils', 'logs')

  static enable() {
    this.isEnabled = true
  }

  static disable() {
    this.isEnabled = false
  }

  static write(entry: LogEntry) {
    if (!this.isEnabled) return

    try {
      mkdirSync(this.logsDir, { recursive: true })
      const date = new Date().toISOString().split('T')[0]
      const filename = `${entry.source}-${date}.jsonl`
      const filepath = join(this.logsDir, filename)
      const line = JSON.stringify(entry) + '\n'
      appendFileSync(filepath, line, { encoding: 'utf-8' })
    } catch {
      // 忽略日志写入错误
    }
  }

  static debug(source: 'webview' | 'extension' | 'mcp', module: string, event: string, data?: unknown) {
    this.write({
      timestamp: new Date().toISOString(),
      level: 'debug',
      source,
      module,
      event,
      ...(data && typeof data === 'object' ? data : { data }),
    })
  }

  static info(source: 'webview' | 'extension' | 'mcp', module: string, event: string, data?: unknown) {
    this.write({
      timestamp: new Date().toISOString(),
      level: 'info',
      source,
      module,
      event,
      ...(data && typeof data === 'object' ? data : { data }),
    })
  }

  static warn(source: 'webview' | 'extension' | 'mcp', module: string, event: string, data?: unknown) {
    this.write({
      timestamp: new Date().toISOString(),
      level: 'warn',
      source,
      module,
      event,
      ...(data && typeof data === 'object' ? data : { data }),
    })
  }

  static error(source: 'webview' | 'extension' | 'mcp', module: string, event: string, data?: unknown) {
    this.write({
      timestamp: new Date().toISOString(),
      level: 'error',
      source,
      module,
      event,
      ...(data && typeof data === 'object' ? data : { data }),
    })
  }

  static getLogsDir() {
    return this.logsDir
  }
}
