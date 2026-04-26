import type * as vscode from 'vscode'
import type { Level, Logger } from '@agentils/logger'

const FILE_PREFIX = 'agentils-extension'
const DEFAULT_LOG_ENDPOINT = 'http://127.0.0.1:12138'

function channelLine(namespace: string, level: Level, message: string, fields?: Record<string, unknown>): string {
    const suffix = fields ? ` ${safeStringify(fields)}` : ''
    return `[AgentILS:${namespace}] ${new Date().toISOString()} ${level} ${message}${suffix}`
}

function safeStringify(value: unknown): string {
    try {
        return JSON.stringify(value)
    } catch {
        return '[unserializable]'
    }
}

export function createExtensionLogger(
    channel: vscode.OutputChannel,
    namespace: string,
    defaultFields: Record<string, unknown> = {},
): Logger {
    const endpoint = process.env.AGENTILS_LOG_URL ?? DEFAULT_LOG_ENDPOINT
    const make = (ns: string): Logger => {
        const emit = (level: Level, message: string, fields?: Record<string, unknown>) => {
            const merged: Record<string, unknown> = { component: 'extension', ...defaultFields, ...(fields ?? {}) }
            channel.appendLine(channelLine(ns, level, message, merged))
            postHttpLog(endpoint, {
                source: 'extension',
                level,
                namespace: ns,
                message,
                fields: merged,
                traceId: typeof merged.traceId === 'string' ? merged.traceId : undefined,
                ts: new Date().toISOString(),
                filePrefix: FILE_PREFIX,
            }).catch((err) => {
                channel.appendLine(
                    channelLine(`http:${ns}`, 'warn', 'http log delivery failed', {
                        endpoint,
                        error: (err as Error).message,
                    }),
                )
            })
        }
        return {
            debug: (message, fields) => emit('debug', message, fields),
            info: (message, fields) => emit('info', message, fields),
            warn: (message, fields) => emit('warn', message, fields),
            error: (message, fields) => emit('error', message, fields),
            child: (subNamespace) => make(`${ns}:${subNamespace}`),
        }
    }

    return make(namespace)
}

async function postHttpLog(endpoint: string, payload: Record<string, unknown>): Promise<void> {
    const base = endpoint.endsWith('/') ? endpoint : `${endpoint}/`
    const response = await fetch(new URL('/api/logs', base), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
}
