export type BrowserLogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface BrowserLoggerOptions {
    endpoint?: string
    source?: string
    defaultFields?: Record<string, unknown>
    traceId?: string
    enabled?: boolean
    fetchImpl?: typeof fetch
    filePrefix?: string
    fileName?: string
    timeoutMs?: number
    onDeliveryError?: (error: unknown, payload: BrowserLogPayload) => void
}

export interface BrowserLogOverrideConfig {
    endpoint?: string
    source?: string
    traceId?: string
    filePrefix?: string
    fileName?: string
    defaultFields?: Record<string, unknown>
    enabled?: boolean
}

export interface BrowserLogPayload {
    ts?: string
    source?: string
    level: BrowserLogLevel
    event: string
    message?: string
    fields?: Record<string, unknown>
    traceId?: string
    filePrefix?: string
    fileName?: string
}

export interface BrowserLogResult {
    ok: boolean
    status?: number
    record?: unknown
    records?: unknown[]
    error?: string
}

export interface BrowserLogger {
    debug: (
        event: string,
        fields?: Record<string, unknown>,
        overrideConfig?: BrowserLogOverrideConfig,
    ) => Promise<BrowserLogResult>
    info: (
        event: string,
        fields?: Record<string, unknown>,
        overrideConfig?: BrowserLogOverrideConfig,
    ) => Promise<BrowserLogResult>
    warn: (
        event: string,
        fields?: Record<string, unknown>,
        overrideConfig?: BrowserLogOverrideConfig,
    ) => Promise<BrowserLogResult>
    error: (
        event: string,
        fields?: Record<string, unknown>,
        overrideConfig?: BrowserLogOverrideConfig,
    ) => Promise<BrowserLogResult>
    log: (
        level: BrowserLogLevel,
        event: string,
        fields?: Record<string, unknown>,
        overrideConfig?: BrowserLogOverrideConfig,
    ) => Promise<BrowserLogResult>
    child: (sourceOrFields: string | Record<string, unknown>) => BrowserLogger
}

const DEFAULT_ENDPOINT = 'http://127.0.0.1:12138'
const DEFAULT_SOURCE = 'browser'
const DEFAULT_TIMEOUT_MS = 5_000

export function createBrowserLogger(options: BrowserLoggerOptions = {}): BrowserLogger {
    const make = (baseOptions: BrowserLoggerOptions): BrowserLogger => {
        const log = async (
            level: BrowserLogLevel,
            event: string,
            fields?: Record<string, unknown>,
            overrideConfig: BrowserLogOverrideConfig = {},
        ): Promise<BrowserLogResult> => {
            const enabled = overrideConfig.enabled ?? baseOptions.enabled ?? true
            if (!enabled) return { ok: true, status: 204 }

            const endpoint = overrideConfig.endpoint ?? baseOptions.endpoint ?? DEFAULT_ENDPOINT
            const fetchImpl = baseOptions.fetchImpl ?? globalThis.fetch?.bind(globalThis)
            if (!fetchImpl) return { ok: false, error: 'fetch is not available in this environment' }

            const payload: BrowserLogPayload = {
                ts: new Date().toISOString(),
                source: overrideConfig.source ?? baseOptions.source ?? DEFAULT_SOURCE,
                level,
                event,
                message: event,
                fields: safeSerializeRecord({
                    ...(baseOptions.defaultFields ?? {}),
                    ...(overrideConfig.defaultFields ?? {}),
                    ...(fields ?? {}),
                }),
                traceId: overrideConfig.traceId ?? baseOptions.traceId,
                filePrefix: overrideConfig.filePrefix ?? baseOptions.filePrefix,
                fileName: overrideConfig.fileName ?? baseOptions.fileName,
            }

            try {
                const response = await postLog(
                    fetchImpl,
                    endpoint,
                    payload,
                    baseOptions.timeoutMs ?? DEFAULT_TIMEOUT_MS,
                )
                const body = (await response.json().catch(() => undefined)) as BrowserLogResult | undefined
                if (!response.ok)
                    return { ok: false, status: response.status, error: body?.error ?? `HTTP ${response.status}` }
                return { ok: true, status: response.status, record: body?.record, records: body?.records }
            } catch (error) {
                baseOptions.onDeliveryError?.(error, payload)
                return { ok: false, error: error instanceof Error ? error.message : String(error) }
            }
        }

        return {
            debug: (event, fields, overrideConfig) => log('debug', event, fields, overrideConfig),
            info: (event, fields, overrideConfig) => log('info', event, fields, overrideConfig),
            warn: (event, fields, overrideConfig) => log('warn', event, fields, overrideConfig),
            error: (event, fields, overrideConfig) => log('error', event, fields, overrideConfig),
            log,
            child: (sourceOrFields) => {
                if (typeof sourceOrFields === 'string') return make({ ...baseOptions, source: sourceOrFields })
                return make({
                    ...baseOptions,
                    defaultFields: {
                        ...(baseOptions.defaultFields ?? {}),
                        ...sourceOrFields,
                    },
                })
            },
        }
    }

    return make(options)
}

async function postLog(
    fetchImpl: typeof fetch,
    endpoint: string,
    payload: BrowserLogPayload,
    timeoutMs: number,
): Promise<Response> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
        return await fetchImpl(new URL('/api/logs', withTrailingSlash(endpoint)), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
        })
    } finally {
        clearTimeout(timeout)
    }
}

function withTrailingSlash(endpoint: string): string {
    return endpoint.endsWith('/') ? endpoint : `${endpoint}/`
}

function safeSerializeRecord(value: Record<string, unknown>): Record<string, unknown> {
    return safeSerialize(value) as Record<string, unknown>
}

function safeSerialize(value: unknown): unknown {
    const seen = new WeakSet<object>()
    const walk = (input: unknown): unknown => {
        if (input === null || typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') {
            return input
        }
        if (typeof input === 'bigint') return input.toString()
        if (typeof input === 'undefined') return '[Undefined]'
        if (typeof input === 'function') return `[Function ${input.name || 'anonymous'}]`
        if (input instanceof Error) return { name: input.name, message: input.message, stack: input.stack }
        if (typeof ArrayBuffer !== 'undefined' && input instanceof ArrayBuffer) {
            return { kind: 'ArrayBuffer', byteLength: input.byteLength }
        }
        if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(input)) {
            return { kind: input.constructor.name, byteLength: input.byteLength }
        }
        if (typeof input === 'object') {
            if (seen.has(input)) return '[Circular]'
            seen.add(input)
            if (Array.isArray(input)) return input.map(walk)
            return Object.fromEntries(
                Object.entries(input as Record<string, unknown>).map(([key, entry]) => [key, walk(entry)]),
            )
        }
        return String(input)
    }
    return walk(value)
}
