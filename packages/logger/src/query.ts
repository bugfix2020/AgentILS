import { mkdir, readFile, readdir, stat } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import type { Level } from './index.js'

export type LogOutputFormat = 'text' | 'json' | 'jsonl' | 'markdown'

export interface LoggerPathsOptions {
    cwd?: string
    logDir?: string
}

export interface LoggerPaths {
    cwd: string
    logDir: string
    defaultFilePattern: string
    endpoint: string
}

export interface ReadLogOptions extends LoggerPathsOptions {
    tail?: number
    from?: string
    to?: string
    format?: LogOutputFormat
}

export interface LogTimeRange {
    from?: Date
    to?: Date
}

export interface ReadableLogRecord {
    ts: string
    seq?: number
    pid?: number
    source: string
    namespace?: string
    level: Level
    event?: string
    message: string
    fields?: unknown
    traceId?: string
    fileName?: string
}

const DEFAULT_LOG_DIR = '.agent-ils/logger/logs'
const DEFAULT_FILE_PATTERN = 'agent-ils-YYYY-MM-DD.jsonl'
const DEFAULT_ENDPOINT = 'http://127.0.0.1:12138'
const DEFAULT_LIMIT = 50
const MAX_FIELD_CHARS = 600
const RELATIVE_TIME_RE = /^(\d+)(ms|s|m|h|d|w)$/i
const TIME_UNITS: Record<string, number> = {
    ms: 1,
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
}

export function resolveLoggerPaths(options: LoggerPathsOptions = {}): LoggerPaths {
    const cwd = resolve(options.cwd ?? process.cwd())
    const logDir = options.logDir ? resolvePath(cwd, options.logDir) : resolve(cwd, DEFAULT_LOG_DIR)
    return {
        cwd,
        logDir,
        defaultFilePattern: DEFAULT_FILE_PATTERN,
        endpoint: DEFAULT_ENDPOINT,
    }
}

export function parseTimeInput(input: string | number | Date | undefined, now = new Date()): Date | undefined {
    if (input === undefined || input === null || input === '') return undefined
    if (input instanceof Date) return assertValidDate(input, String(input))
    if (typeof input === 'number') return assertValidDate(new Date(input), String(input))

    const value = input.trim()
    const relative = RELATIVE_TIME_RE.exec(value)
    if (relative) {
        const amount = Number(relative[1])
        const unit = relative[2].toLowerCase()
        return new Date(now.getTime() - amount * TIME_UNITS[unit])
    }

    if (/^\d+$/.test(value)) return assertValidDate(new Date(Number(value)), value)
    return assertValidDate(new Date(value), value)
}

export function parseTimeRange(options: { from?: string; to?: string }, now = new Date()): LogTimeRange {
    return {
        from: parseTimeInput(options.from, now),
        to: parseTimeInput(options.to, now),
    }
}

export async function ensureLogDir(options: LoggerPathsOptions = {}): Promise<LoggerPaths> {
    const paths = resolveLoggerPaths(options)
    await mkdir(paths.logDir, { recursive: true })
    return paths
}

export async function readLogRecords(options: ReadLogOptions = {}): Promise<ReadableLogRecord[]> {
    const paths = resolveLoggerPaths(options)
    const files = await listJsonlFiles(paths.logDir)
    const range = parseTimeRange(options)
    const records: ReadableLogRecord[] = []

    for (const fileName of files) {
        const raw = await readFile(resolve(paths.logDir, fileName), 'utf8')
        for (const line of raw.split('\n')) {
            const trimmed = line.trim()
            if (!trimmed) continue
            const record = parseLogLine(trimmed, fileName)
            if (!record || !matchesRecord(record, options, range)) continue
            records.push(record)
        }
    }

    const limit = normalizeLimit(options.tail)
    const hasTimeRange = options.from !== undefined || options.to !== undefined
    records.sort((left, right) => timestampMs(right.ts) - timestampMs(left.ts))
    const selected = records.slice(0, limit)
    if (hasTimeRange) selected.sort((left, right) => timestampMs(left.ts) - timestampMs(right.ts))
    return selected
}

export function formatLogRecords(records: ReadableLogRecord[], format: LogOutputFormat = 'text'): string {
    if (format === 'json') return JSON.stringify(records, null, 2)
    if (format === 'jsonl') return records.map((record) => JSON.stringify(record)).join('\n')
    if (format === 'markdown') return formatMarkdown(records)
    return formatText(records)
}

function resolvePath(cwd: string, value: string): string {
    return isAbsolute(value) ? value : resolve(cwd, value)
}

function assertValidDate(date: Date, input: string): Date {
    if (Number.isNaN(date.getTime())) throw new Error(`Invalid time value: ${input}`)
    return date
}

async function listJsonlFiles(logDir: string): Promise<string[]> {
    try {
        const dirStat = await stat(logDir)
        if (!dirStat.isDirectory()) return []
        const files = await readdir(logDir)
        return files.filter((file) => file.endsWith('.jsonl')).sort()
    } catch {
        return []
    }
}

function parseLogLine(line: string, fileName: string): ReadableLogRecord | undefined {
    try {
        const parsed = JSON.parse(line) as Partial<ReadableLogRecord>
        if (!parsed.ts || !parsed.level) return undefined
        return {
            ts: parsed.ts,
            seq: parsed.seq,
            pid: parsed.pid,
            source: parsed.source ?? 'unknown',
            namespace: parsed.namespace,
            level: parsed.level,
            event: parsed.event,
            message: parsed.message ?? '',
            fields: parsed.fields,
            traceId: parsed.traceId,
            fileName: parsed.fileName ?? fileName,
        }
    } catch {
        return undefined
    }
}

function matchesRecord(record: ReadableLogRecord, options: ReadLogOptions, range: LogTimeRange): boolean {
    const ts = timestampMs(record.ts)
    if (range.from && ts < range.from.getTime()) return false
    if (range.to && ts > range.to.getTime()) return false
    return true
}

function timestampMs(ts: string): number {
    const value = new Date(ts).getTime()
    return Number.isNaN(value) ? 0 : value
}

function normalizeLimit(limit: number | undefined): number {
    if (!limit || Number.isNaN(limit) || limit < 1) return DEFAULT_LIMIT
    return Math.floor(limit)
}

function formatText(records: ReadableLogRecord[]): string {
    if (!records.length) return 'No log records found.'
    return records.map((record) => formatRecordSummary(record, true)).join('\n')
}

function formatMarkdown(records: ReadableLogRecord[]): string {
    if (!records.length) return 'No log records found.'
    return ['# AgentILS Logger Records', '', ...records.map((record) => `- ${formatRecordSummary(record, true)}`)].join(
        '\n',
    )
}

function formatRecordSummary(record: ReadableLogRecord, includeFields = false): string {
    const event = record.event ? ` ${record.event}` : ''
    const trace = record.traceId ? ` trace=${record.traceId}` : ''
    const fields = includeFields && record.fields ? ` ${truncate(JSON.stringify(record.fields), MAX_FIELD_CHARS)}` : ''
    return `[${record.ts}] ${record.level.toUpperCase()} ${record.source}${event}${trace} ${record.message}${fields}`.trim()
}

function truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) return value
    return `${value.slice(0, maxLength - 1)}...`
}
