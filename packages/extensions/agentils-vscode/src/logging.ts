import type * as vscode from 'vscode'
import type { Level, Logger } from '@agent-ils/logger'

const FILE_PREFIX = 'agentils-extension'
const DEFAULT_LOG_ENDPOINT = 'http://127.0.0.1:12138'
const HEALTH_TIMEOUT_MS = 2_000
const HEALTH_PROBE_INTERVAL_MS = 10_000
const DELIVERY_WARN_INTERVAL_MS = 60_000

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
    const groupStack: string[] = []
    let collectorReady = false
    let probeStarted = false
    let probeInterval: ReturnType<typeof setInterval> | null = null
    let lastDeliveryWarnAt = 0

    const startProbe = () => {
        if (probeStarted) return
        probeStarted = true
        void probeCollector(endpoint).then((ready) => {
            collectorReady = ready
        })
        probeInterval = setInterval(() => {
            void probeCollector(endpoint).then((ready) => {
                collectorReady = ready
            })
        }, HEALTH_PROBE_INTERVAL_MS)
        probeInterval.unref?.()
    }

    const warnDeliveryFailure = (ns: string, error: unknown) => {
        const now = Date.now()
        if (now - lastDeliveryWarnAt < DELIVERY_WARN_INTERVAL_MS) return
        lastDeliveryWarnAt = now
        channel.appendLine(
            channelLine(`http:${ns}`, 'warn', 'http log delivery failed', {
                endpoint,
                error: error instanceof Error ? error.message : String(error),
            }),
        )
    }

    const make = (ns: string): Logger => {
        const emit = (level: Level, message: string, fields?: Record<string, unknown>) => {
            const merged: Record<string, unknown> = {
                component: 'extension',
                ...defaultFields,
                ...(fields ?? {}),
                ...activeGroupFields(groupStack),
            }
            channel.appendLine(channelLine(ns, level, message, merged))
            startProbe()
            if (!collectorReady) return
            postHttpLog(endpoint, {
                source: 'extension',
                level,
                namespace: ns,
                event: message,
                message,
                fields: merged,
                traceId: typeof fields?.traceId === 'string' ? fields.traceId : undefined,
                ts: new Date().toISOString(),
                filePrefix: FILE_PREFIX,
            }).catch((err) => {
                collectorReady = false
                warnDeliveryFailure(ns, err)
            })
        }
        return {
            debug: (message, fields) => emit('debug', message, fields),
            info: (message, fields) => emit('info', message, fields),
            warn: (message, fields) => emit('warn', message, fields),
            error: (message, fields) => emit('error', message, fields),
            group: (label, fields) => {
                groupStack.push(label)
                emit('info', 'group.start', fields)
            },
            groupEnd: (fields) => {
                if (!groupStack.length) return
                emit('info', 'group.end', fields)
                groupStack.pop()
            },
            child: (subNamespace) => make(`${ns}:${subNamespace}`),
        }
    }

    return make(namespace)
}

async function probeCollector(endpoint: string): Promise<boolean> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)
    try {
        const base = endpoint.endsWith('/') ? endpoint : `${endpoint}/`
        const response = await fetch(new URL('/api/health', base), {
            method: 'GET',
            signal: controller.signal,
        })
        if (!response.ok) return false
        const body = (await response.json().catch(() => undefined)) as { ok?: unknown; name?: unknown } | undefined
        return body?.ok === true && body.name === 'agentils-logger'
    } catch {
        return false
    } finally {
        clearTimeout(timeout)
    }
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

function activeGroupFields(groupStack: string[]): Record<string, unknown> {
    if (!groupStack.length) return {}
    return {
        group: groupStack[groupStack.length - 1],
        groupPath: [...groupStack],
        groupDepth: groupStack.length,
    }
}
