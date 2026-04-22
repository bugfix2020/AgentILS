import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

function pad(value: number) {
    return String(value).padStart(2, '0')
}

function buildMinuteDirectory(kind: 'vscode-extension' | 'dev-vscode-extension', now: Date) {
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
        ? readdirSync(directory)
              .filter((fileName) => /^\d{2}\.log$/.test(fileName))
              .sort()
        : []
    let nextIndex = 1
    if (existing.length > 0) {
        const last = existing[existing.length - 1] ?? '00.log'
        nextIndex = Number.parseInt(last.slice(0, 2), 10) + 1
    }
    return join(directory, `${pad(nextIndex)}.log`)
}

function readAgentilsEnvFromShellConfig() {
    const candidates = [
        join(homedir(), '.zshrc'),
        join(homedir(), '.zprofile'),
        join(homedir(), '.bashrc'),
        join(homedir(), '.bash_profile'),
    ]

    for (const path of candidates) {
        if (!existsSync(path)) {
            continue
        }
        const content = readFileSync(path, 'utf8')
        const match = content.match(/^\s*export\s+AGENTILS_ENV=(["']?)([A-Za-z0-9_-]+)\1\s*$/m)
        if (match?.[2]) {
            return match[2]
        }
    }

    return null
}

export function resolveAgentilsEnv() {
    return process.env.AGENTILS_ENV ?? readAgentilsEnvFromShellConfig() ?? null
}

class AgentILSExtensionLogger {
    private currentMinuteKey: string | null = null
    private currentLogPath: string | null = null
    private currentDevLogPath: string | null = null

    log(scope: string, message: string, detail?: unknown) {
        const now = new Date()
        const minuteKey = [
            now.getFullYear(),
            pad(now.getMonth() + 1),
            pad(now.getDate()),
            pad(now.getHours()),
            pad(now.getMinutes()),
        ].join('-')

        if (this.currentMinuteKey !== minuteKey || !this.currentLogPath) {
            const directory = buildMinuteDirectory('vscode-extension', now)
            mkdirSync(directory, { recursive: true })
            this.currentLogPath = pickNextLogPath(directory)
            this.currentMinuteKey = minuteKey

            if (resolveAgentilsEnv() === 'DEV') {
                const devDirectory = buildMinuteDirectory('dev-vscode-extension', now)
                mkdirSync(devDirectory, { recursive: true })
                this.currentDevLogPath = pickNextLogPath(devDirectory)
            } else {
                this.currentDevLogPath = null
            }
        }

        const payload = detail === undefined ? '' : ` ${safeStringify(detail)}`

        appendFileSync(this.currentLogPath, `[${now.toISOString()}] [${scope}] ${message}${payload}\n`, 'utf8')
        if (this.currentDevLogPath) {
            appendFileSync(this.currentDevLogPath, `[${now.toISOString()}] [${scope}] ${message}${payload}\n`, 'utf8')
        }
    }
}

function safeStringify(value: unknown) {
    try {
        return JSON.stringify(value)
    } catch {
        return String(value)
    }
}

export const extensionLogger = new AgentILSExtensionLogger()
