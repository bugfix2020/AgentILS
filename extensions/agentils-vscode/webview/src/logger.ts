/**
 * 日志系统（仅开发环境，通过 postMessage 发送到 Extension）
 */

import { postMessage } from './vscode-api'

export interface LogEntry {
  timestamp: string
  level: 'debug' | 'info' | 'warn' | 'error'
  source: 'webview'
  module: string
  event: string
  data?: unknown
}

class Logger {
  private isEnabled: boolean

  constructor() {
    // 检查环境变量（通过 VITE_DEBUG=true 或全局变量）
    // 默认启用日志以便诊断问题
    this.isEnabled = 
      (globalThis as any).__AGENTILS_DEBUG__ === true ||
      (globalThis as any).__VITE_DEBUG__ === true ||
      import.meta.env.DEV ||  // Vite 开发模式
      true  // 暂时默认启用以进行诊断
  }

  private log(level: LogEntry['level'], module: string, event: string, data?: unknown) {
    if (!this.isEnabled) return

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      source: 'webview',
      module,
      event,
      ...(data && typeof data === 'object' ? data : { data }),
    }

    // 发送到 Extension，由 Extension 写入文件
    try {
      postMessage({ action: 'logEntry', payload: entry } as any)
    } catch {
      // 如果发送失败，至少输出到控制台便于本地开发
      console[level](`[${module}] ${event}`, data)
    }
  }

  debug(module: string, event: string, data?: unknown) {
    this.log('debug', module, event, data)
  }

  info(module: string, event: string, data?: unknown) {
    this.log('info', module, event, data)
  }

  warn(module: string, event: string, data?: unknown) {
    this.log('warn', module, event, data)
  }

  error(module: string, event: string, data?: unknown) {
    this.log('error', module, event, data)
  }

  enable() {
    this.isEnabled = true
  }

  disable() {
    this.isEnabled = false
  }
}

export const logger = new Logger()
