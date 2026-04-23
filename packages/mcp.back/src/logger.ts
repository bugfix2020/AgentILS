import { appendFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function buildMinuteDirectory(kind: 'mcp' | 'dev-mcp', now: Date) {
  return join(
    homedir(),
    '.agentils',
    'logs',
    kind,
    String(now.getFullYear()),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
  )
}

function pickNextLogPath(directory: string) {
  const existing = existsSync(directory)
    ? readdirSync(directory).filter((fileName) => /^\d{2}\.log$/.test(fileName)).sort()
    : []
  let nextIndex = 1
  if (existing.length > 0) {
    const last = existing[existing.length - 1] ?? '00.log'
    nextIndex = Number.parseInt(last.slice(0, 2), 10) + 1
  }
  return join(directory, `${pad(nextIndex)}.log`)
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

class AgentILSMcpLogger {
  private minuteKey: string | null = null
  private logPath: string | null = null
  private devLogPath: string | null = null

  info(scope: string, message: string, detail?: unknown) {
    this.write(scope, message, detail)
  }

  error(scope: string, message: string, detail?: unknown) {
    this.write(scope, `ERROR ${message}`, detail)
  }

  debug(scope: string, message: string, detail?: unknown) {
    this.write(scope, `DEBUG ${message}`, detail)
  }

  private write(scope: string, message: string, detail?: unknown) {
    const now = new Date()
    const minuteKey = [
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate()),
      pad(now.getHours()),
      pad(now.getMinutes()),
    ].join('-')

    if (this.minuteKey !== minuteKey || !this.logPath) {
      const directory = buildMinuteDirectory('mcp', now)
      mkdirSync(directory, { recursive: true })
      this.logPath = pickNextLogPath(directory)
      this.minuteKey = minuteKey

      if (process.env.AGENTILS_ENV === 'DEV') {
        const devDirectory = buildMinuteDirectory('dev-mcp', now)
        mkdirSync(devDirectory, { recursive: true })
        this.devLogPath = pickNextLogPath(devDirectory)
      } else {
        this.devLogPath = null
      }
    }

    const line = `[${now.toISOString()}] [${scope}] ${message}${
      detail === undefined ? '' : ` ${safeStringify(detail)}`
    }\n`

    appendFileSync(this.logPath, line, 'utf8')
    if (this.devLogPath) {
      appendFileSync(this.devLogPath, line, 'utf8')
    }
  }
}

export const mcpLogger = new AgentILSMcpLogger()
