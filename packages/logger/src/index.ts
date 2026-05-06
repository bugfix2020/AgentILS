import { appendFile, mkdir } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { join } from 'node:path'

export type Level = 'debug' | 'info' | 'warn' | 'error'

const DEFAULT_HTTP_LOG_HOST = '127.0.0.1'
const DEFAULT_HTTP_LOG_PORT = 12138
// Keep these defaults in sync with packages/logger/src/query.ts so direct SDK
// callers and CLI users land in the same log directory and file naming scheme.
const DEFAULT_LOG_FILE_PREFIX = 'agent-ils'
const DEFAULT_LOG_DIR_REL = '.agent-ils/logger/logs'
const MAX_BODY_BYTES = 1024 * 1024
const LEVELS = new Set<Level>(['debug', 'info', 'warn', 'error'])

const RAW = (process.env.AGENTILS_DEBUG ?? '').trim().toLowerCase()
const ENABLED_ALL = RAW === '1' || RAW === 'true' || RAW === '*'
const ENABLED_SET =
    RAW && !ENABLED_ALL && RAW !== '0' && RAW !== 'false'
        ? new Set(
              RAW.split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
          )
        : null

function shouldLog(ns: string, level: Level): boolean {
    if (level === 'warn' || level === 'error') return true
    if (ENABLED_ALL) return true
    if (ENABLED_SET) {
        // match by full ns or any prefix segment
        if (ENABLED_SET.has(ns)) return true
        for (const seg of ns.split(':')) if (ENABLED_SET.has(seg)) return true
    }
    return false
}

function format(ns: string, level: Level, msg: string, fields?: Record<string, unknown>): string {
    const ts = new Date().toISOString()
    const payload = fields ? ' ' + JSON.stringify(safeSerialize(fields)) : ''
    return `[agentils:${ns}] ${ts} ${level} ${msg}${payload}`
}

export interface Logger {
    debug: (msg: string, fields?: Record<string, unknown>) => void
    info: (msg: string, fields?: Record<string, unknown>) => void
    warn: (msg: string, fields?: Record<string, unknown>) => void
    error: (msg: string, fields?: Record<string, unknown>) => void
    child: (subNs: string) => Logger
}

/** Minimal shape of a sink (VS Code's `OutputChannel` satisfies this). */
export interface LogSink {
    appendLine(line: string): void
}

export interface HttpLogPayload {
    source?: string
    level?: Level
    namespace?: string
    event?: string
    message?: string
    fields?: Record<string, unknown>
    traceId?: string
    ts?: string
    /** Writes to `<filePrefix>-YYYY-MM-DD.jsonl`; defaults to `agentils-<source>`. */
    filePrefix?: string
    /** Writes to this exact JSONL file name after sanitization. Overrides `filePrefix`. */
    fileName?: string
}

export interface JsonlLogRecord {
    ts: string
    seq: number
    pid: number
    source: string
    namespace: string
    level: Level
    event?: string
    message: string
    fields: unknown
    traceId?: string
    fileName: string
}

export interface HttpLogServerOptions {
    host?: string
    port?: number
    logDir?: string
    filePrefix?: string
}

export interface HttpLogServerHandle {
    host: string
    port: number
    url: string
    logDir: string
    close: () => Promise<void>
}

export interface HttpLoggerOptions {
    source: string
    namespace?: string
    endpoint?: string
    fallback?: Logger
    defaultFields?: Record<string, unknown>
    filePrefix?: string
    fileName?: string
    respectDebugEnv?: boolean
}

let sequence = 0

function build(ns: string, sink: LogSink): Logger {
    return {
        debug: (msg, fields) => {
            if (shouldLog(ns, 'debug')) sink.appendLine(format(ns, 'debug', msg, fields))
        },
        info: (msg, fields) => {
            if (shouldLog(ns, 'info')) sink.appendLine(format(ns, 'info', msg, fields))
        },
        warn: (msg, fields) => {
            if (shouldLog(ns, 'warn')) sink.appendLine(format(ns, 'warn', msg, fields))
        },
        error: (msg, fields) => {
            if (shouldLog(ns, 'error')) sink.appendLine(format(ns, 'error', msg, fields))
        },
        child: (subNs) => build(`${ns}:${subNs}`, sink),
    }
}

const stderrSink: LogSink = {
    appendLine(line) {
        process.stderr.write(line + '\n')
    },
}

export function createLogger(ns: string): Logger {
    return build(ns, stderrSink)
}

export function createChannelLogger(channel: LogSink, ns: string): Logger {
    return build(ns, channel)
}

export function defaultHttpLogEndpoint(): string {
    return `http://${DEFAULT_HTTP_LOG_HOST}:${DEFAULT_HTTP_LOG_PORT}`
}

export function defaultLogDir(): string {
    return process.env.AGENTILS_LOG_DIR ?? join(process.cwd(), DEFAULT_LOG_DIR_REL)
}

export function createHttpLogger(options: HttpLoggerOptions): Logger {
    const namespace = options.namespace ?? options.source
    const endpoint = options.endpoint ?? process.env.AGENTILS_LOG_URL ?? defaultHttpLogEndpoint()
    const fallback = options.fallback ?? createLogger(`http-client:${namespace}`)
    const respectDebugEnv = options.respectDebugEnv ?? false

    const emit = (ns: string, level: Level, message: string, fields?: Record<string, unknown>) => {
        if (respectDebugEnv && !shouldLog(ns, level)) return
        const body: HttpLogPayload = {
            source: options.source,
            namespace: ns,
            level,
            message,
            fields:
                options.defaultFields || fields ? { ...(options.defaultFields ?? {}), ...(fields ?? {}) } : undefined,
            traceId:
                typeof fields?.traceId === 'string'
                    ? fields.traceId
                    : typeof options.defaultFields?.traceId === 'string'
                      ? options.defaultFields.traceId
                      : undefined,
            ts: new Date().toISOString(),
            filePrefix: options.filePrefix,
            fileName: options.fileName,
        }
        void postHttpLog(endpoint, body).catch((err) => {
            fallback.warn('http log delivery failed', {
                endpoint,
                namespace: ns,
                level,
                error: (err as Error).message,
            })
        })
    }

    const make = (ns: string): Logger => ({
        debug: (msg, fields) => emit(ns, 'debug', msg, fields),
        info: (msg, fields) => emit(ns, 'info', msg, fields),
        warn: (msg, fields) => emit(ns, 'warn', msg, fields),
        error: (msg, fields) => emit(ns, 'error', msg, fields),
        child: (subNs) => make(`${ns}:${subNs}`),
    })

    return make(namespace)
}

export async function startHttpLogServer(options: HttpLogServerOptions = {}): Promise<HttpLogServerHandle> {
    const host = options.host ?? DEFAULT_HTTP_LOG_HOST
    const port = options.port ?? DEFAULT_HTTP_LOG_PORT
    const logDir = options.logDir ?? defaultLogDir()
    const filePrefix = options.filePrefix ?? DEFAULT_LOG_FILE_PREFIX
    await mkdir(logDir, { recursive: true })

    const server = createServer((req, res) => {
        void handleLogRequest(req, res, logDir, filePrefix).catch((err) => {
            if (!res.headersSent) {
                sendJson(res, 400, { ok: false, error: (err as Error).message })
            } else {
                res.end()
            }
        })
    })

    return new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, host, () => {
            server.off('error', reject)
            resolve({
                host,
                port,
                url: `http://${host}:${port}`,
                logDir,
                close: () => closeServer(server),
            })
        })
    })
}

export function safeSerialize(value: unknown): unknown {
    const seen = new WeakSet<object>()
    const walk = (input: unknown): unknown => {
        if (input === null || typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') {
            return input
        }
        if (typeof input === 'bigint') return input.toString()
        if (typeof input === 'undefined') return '[Undefined]'
        if (typeof input === 'function') return `[Function ${input.name || 'anonymous'}]`
        if (input instanceof Error) {
            return { name: input.name, message: input.message, stack: input.stack }
        }
        if (Buffer.isBuffer(input)) {
            return { kind: 'Buffer', byteLength: input.byteLength }
        }
        if (ArrayBuffer.isView(input)) {
            return { kind: input.constructor.name, byteLength: input.byteLength }
        }
        if (input instanceof ArrayBuffer) {
            return { kind: 'ArrayBuffer', byteLength: input.byteLength }
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

async function postHttpLog(endpoint: string, payload: HttpLogPayload): Promise<void> {
    const response = await fetch(new URL('/api/logs', withTrailingSlash(endpoint)), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
}

async function handleLogRequest(
    req: IncomingMessage,
    res: ServerResponse,
    logDir: string,
    filePrefix: string,
): Promise<void> {
    setCorsHeaders(res)
    if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
    }

    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (req.method === 'GET' && url.pathname === '/api/health') {
        sendJson(res, 200, { ok: true, name: 'agentils-logger', logDir })
        return
    }
    if (req.method === 'POST' && url.pathname === '/api/logs') {
        const payload = JSON.parse(await readRequestBody(req)) as HttpLogPayload | HttpLogPayload[]
        if (Array.isArray(payload)) {
            const records = []
            for (const entry of payload) records.push(await writeLogRecord(logDir, filePrefix, entry))
            sendJson(res, 200, { ok: true, records })
            return
        }
        const record = await writeLogRecord(logDir, filePrefix, payload)
        sendJson(res, 200, { ok: true, record })
        return
    }
    sendJson(res, 404, { ok: false, error: 'not-found' })
}

async function writeLogRecord(logDir: string, filePrefix: string, payload: HttpLogPayload): Promise<JsonlLogRecord> {
    const ts = payload.ts ?? new Date().toISOString()
    const source = payload.source ?? 'unknown'
    const fileName = logFileName(filePrefix, payload, source, ts)
    const record: JsonlLogRecord = {
        ts,
        seq: ++sequence,
        pid: process.pid,
        source,
        namespace: payload.namespace ?? source,
        level: isLevel(payload.level) ? payload.level : 'info',
        event: payload.event,
        message: payload.message ?? '',
        fields: safeSerialize(payload.fields ?? {}),
        traceId: payload.traceId,
        fileName,
    }
    await mkdir(logDir, { recursive: true })
    await appendFile(join(logDir, fileName), `${JSON.stringify(record)}\n`, 'utf8')
    return record
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = []
    let total = 0
    for await (const chunk of req) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        total += buf.byteLength
        if (total > MAX_BODY_BYTES) throw new Error('request-body-too-large')
        chunks.push(buf)
    }
    return Buffer.concat(chunks).toString('utf8') || '{}'
}

function logFileName(defaultPrefix: string, payload: HttpLogPayload, source: string, ts: string): string {
    if (payload.fileName) return ensureJsonl(sanitizeFileName(payload.fileName))
    const prefix = payload.filePrefix ?? (source === 'unknown' ? defaultPrefix : `${defaultPrefix}-${source}`)
    return `${sanitizeFilePart(prefix)}-${ts.slice(0, 10)}.jsonl`
}

function isLevel(value: unknown): value is Level {
    return typeof value === 'string' && LEVELS.has(value as Level)
}

function withTrailingSlash(endpoint: string): string {
    return endpoint.endsWith('/') ? endpoint : `${endpoint}/`
}

function sanitizeFileName(fileName: string): string {
    const base = fileName.split(/[\\/]/).pop() ?? DEFAULT_LOG_FILE_PREFIX
    return sanitizeFilePart(base)
}

function sanitizeFilePart(value: string): string {
    const sanitized = value
        .trim()
        .replace(/[^a-zA-Z0-9_.-]/g, '_')
        .replace(/^\.+/, '')
    return sanitized || DEFAULT_LOG_FILE_PREFIX
}

function ensureJsonl(fileName: string): string {
    return fileName.endsWith('.jsonl') ? fileName : `${fileName}.jsonl`
}

function setCorsHeaders(res: ServerResponse): void {
    res.setHeader('access-control-allow-origin', '*')
    res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')
    res.setHeader('access-control-allow-headers', 'content-type')
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(body))
}

function closeServer(server: Server): Promise<void> {
    return new Promise((resolve, reject) => {
        server.close((err) => {
            if (err) reject(err)
            else resolve()
        })
    })
}
