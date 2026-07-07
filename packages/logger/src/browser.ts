export type BrowserLogLevel = 'debug' | 'info' | 'warn' | 'error'

declare global {
    interface Window {
        $agentILS?: {
            logger?: {
                overrideKey?: string
            }
        }
    }
}

export interface BrowserLoggerOptions {
    endpoint?: string
    source?: string
    defaultFields?: Record<string, unknown>
    traceId?: string
    enabled?: boolean
    overrideKey?: string
    fetchImpl?: typeof fetch
    filePrefix?: string
    fileName?: string
    timeoutMs?: number
    onDeliveryError?: (error: unknown, payload: BrowserLogPayload) => void
    /** When true, start health probing immediately and auto-spawn collector in Node. */
    open?: boolean
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

export interface BrowserLogRecord {
    ts?: string
    seq?: number
    pid?: number
    source?: string
    namespace?: string
    level?: BrowserLogLevel
    event?: string
    message?: string
    fields?: unknown
    traceId?: string
    fileName?: string
    filePath?: string
    relativePath?: string
    line?: number
    location?: string
    relativeLocation?: string
    [key: string]: unknown
}

export interface BrowserLogResult {
    ok: boolean
    status?: number
    record?: BrowserLogRecord
    records?: BrowserLogRecord[]
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
    group: (
        label: string,
        fields?: Record<string, unknown>,
        overrideConfig?: BrowserLogOverrideConfig,
    ) => Promise<BrowserLogResult>
    groupEnd: (fields?: Record<string, unknown>, overrideConfig?: BrowserLogOverrideConfig) => Promise<BrowserLogResult>
    child: (sourceOrFields: string | Record<string, unknown>) => BrowserLogger
}

const DEFAULT_ENDPOINT = 'http://127.0.0.1:12138'
const DEFAULT_SOURCE = 'browser'
const DEFAULT_TIMEOUT_MS = 5_000
const HEALTH_TIMEOUT_MS = 2_000
const HEALTH_PROBE_INTERVAL_MS = 10_000

const isNode = typeof process !== 'undefined' && !!process.versions?.node

export function createBrowserLogger(options: BrowserLoggerOptions = {}): BrowserLogger {
    // Shared collector readiness state across all child loggers
    let collectorReady = false
    let probeInterval: ReturnType<typeof setInterval> | null = null
    let probeStarted = false
    let collectorSpawned = false
    const groupStack: string[] = []

    const probeHealthOnce = async (fetchImpl: typeof fetch, endpoint: string): Promise<boolean> => {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)
        try {
            const res = await fetchImpl(new URL('/api/health', withTrailingSlash(endpoint)), {
                method: 'GET',
                signal: controller.signal,
            })
            if (!res.ok) return false
            const body = (await res.json().catch(() => undefined)) as { ok?: unknown; name?: unknown } | undefined
            return body?.ok === true && body.name === 'agentils-logger'
        } catch {
            return false
        } finally {
            clearTimeout(timeout)
        }
    }

    const startBackgroundProbe = (fetchImpl: typeof fetch, endpoint: string) => {
        if (probeInterval) return
        // Run an immediate probe, then repeat on interval
        probeHealthOnce(fetchImpl, endpoint).then((ok) => {
            collectorReady = ok
        })
        probeInterval = setInterval(() => {
            probeHealthOnce(fetchImpl, endpoint).then((ok) => {
                collectorReady = ok
            })
        }, HEALTH_PROBE_INTERVAL_MS)
        probeInterval.unref?.()
    }

    const markUnready = () => {
        collectorReady = false
        // Background probe continues running; no need to restart it
    }

    const findCollectorBinary = async (): Promise<string | null> => {
        if (!isNode) return null
        try {
            const { existsSync } = await import('node:fs')
            const { execFileSync } = await import('node:child_process')
            const { createRequire } = await import('node:module')
            const { homedir } = await import('node:os')
            const { join, delimiter } = await import('node:path')

            const isWindows = process.platform === 'win32'
            const binaryName = isWindows ? 'agent-ils-logger.exe' : 'agent-ils-logger'
            const expectedVersion = readPackageVersion(createRequire(import.meta.url))

            // 1. Check PATH
            const pathEnv = process.env.PATH
            if (pathEnv) {
                for (const dir of pathEnv.split(delimiter)) {
                    const candidate = join(dir, binaryName)
                    if (existsSync(candidate) && binaryMatchesVersion(execFileSync, candidate, expectedVersion)) {
                        return candidate
                    }
                }
            }

            // 2. Check cache dir
            const platformArch =
                process.platform === 'darwin'
                    ? process.arch === 'arm64'
                        ? 'darwin-arm64'
                        : 'darwin-amd64'
                    : process.platform === 'linux'
                      ? 'linux-amd64'
                      : process.platform === 'win32'
                        ? 'windows-amd64'
                        : null
            if (platformArch) {
                const cachedName = isWindows
                    ? `agent-ils-logger-${platformArch}-${expectedVersion}.exe`
                    : `agent-ils-logger-${platformArch}-${expectedVersion}`
                const cachePath = join(homedir(), '.agent-ils', 'bin', cachedName)
                if (existsSync(cachePath) && binaryMatchesVersion(execFileSync, cachePath, expectedVersion)) {
                    return cachePath
                }
            }

            return null
        } catch {
            return null
        }
    }

    const spawnCollector = async () => {
        if (!isNode || collectorSpawned) return
        collectorSpawned = true
        try {
            const { execFile } = await import('node:child_process')
            const binaryPath = await findCollectorBinary()
            if (!binaryPath) {
                // eslint-disable-next-line no-console
                console.warn('[agent-ils-logger] collector binary not found, open=true has no effect')
                return
            }
            const child = execFile(binaryPath, ['serve', '--silent'], {
                env: { ...process.env, AGENT_ILS_INVOKER: 'open' },
            })
            child.unref()
        } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[agent-ils-logger] failed to spawn collector:', err)
        }
    }

    const ensureCollector = (fetchImpl: typeof fetch, endpoint: string) => {
        if (probeStarted) return
        probeStarted = true
        startBackgroundProbe(fetchImpl, endpoint)
        if (options.open) {
            void spawnCollector()
        }
    }

    const make = (baseOptions: BrowserLoggerOptions): BrowserLogger => {
        const log = async (
            level: BrowserLogLevel,
            event: string,
            fields?: Record<string, unknown>,
            overrideConfig: BrowserLogOverrideConfig = {},
        ): Promise<BrowserLogResult> => {
            const configuredKey = baseOptions.overrideKey
            const windowKey = typeof window !== 'undefined' ? window.$agentILS?.logger?.overrideKey : undefined
            const keyMatched = configuredKey && windowKey && configuredKey === windowKey
            const enabled = keyMatched || (overrideConfig.enabled ?? baseOptions.enabled ?? true)
            if (!enabled) return { ok: true, status: 204 }

            const endpoint = overrideConfig.endpoint ?? baseOptions.endpoint ?? DEFAULT_ENDPOINT
            const fetchImpl = baseOptions.fetchImpl ?? globalThis.fetch?.bind(globalThis)
            if (!fetchImpl) return { ok: false, error: 'fetch is not available in this environment' }

            // Ensure background probe is running (and collector spawned if open=true)
            ensureCollector(fetchImpl, endpoint)

            // Collector readiness check — synchronous, no fetch
            if (!collectorReady) return { ok: true, status: 204 }

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
                    ...activeGroupFields(groupStack),
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
                if (!response.ok) {
                    markUnready()
                    const body = (await response.json().catch(() => undefined)) as BrowserLogResult | undefined
                    return { ok: false, status: response.status, error: body?.error ?? `HTTP ${response.status}` }
                }
                const body = (await response.json().catch(() => undefined)) as BrowserLogResult | undefined
                return { ok: true, status: response.status, record: body?.record, records: body?.records }
            } catch (error) {
                markUnready()
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
            group: (label, fields, overrideConfig) => {
                groupStack.push(label)
                return log('info', 'group.start', fields, overrideConfig)
            },
            groupEnd: (fields, overrideConfig) => {
                if (!groupStack.length) return Promise.resolve({ ok: true, status: 204 })
                const result = log('info', 'group.end', fields, overrideConfig)
                groupStack.pop()
                return result
            },
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

    // If open=true, start probing immediately (don't wait for first log call)
    if (options.open) {
        const fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis)
        if (fetchImpl) {
            ensureCollector(fetchImpl, options.endpoint ?? DEFAULT_ENDPOINT)
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

function activeGroupFields(groupStack: string[]): Record<string, unknown> {
    if (!groupStack.length) return {}
    return {
        group: groupStack[groupStack.length - 1],
        groupPath: [...groupStack],
        groupDepth: groupStack.length,
    }
}

function readPackageVersion(require: NodeRequire): string {
    try {
        const packageJson = require('../package.json') as { version?: unknown }
        return typeof packageJson.version === 'string' ? packageJson.version : '0.0.0'
    } catch {
        return '0.0.0'
    }
}

function binaryMatchesVersion(
    execFileSync: typeof import('node:child_process').execFileSync,
    candidate: string,
    expectedVersion: string,
): boolean {
    try {
        const output = execFileSync(candidate, ['--version'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 3_000,
        })
        return new RegExp(`\\b${escapeRegExp(expectedVersion)}\\b`).test(output)
    } catch {
        return false
    }
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
