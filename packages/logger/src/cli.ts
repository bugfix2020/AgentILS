#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { cac } from 'cac'
import { ensureLogDir, formatLogRecords, readLogRecords, type LogOutputFormat } from './query.js'
import { startHttpLogServer } from './index.js'

interface ServeOptions {
    cwd?: string
    host?: string
    port?: string | number
    logDir?: string
    filePrefix?: string
    json?: boolean
    silent?: boolean
}

interface ReadOptions {
    cwd?: string
    logDir?: string
    tail?: string | number
    from?: string
    to?: string
    format?: LogOutputFormat
}

const VERSION = readPackageVersion()
const READ_FLAGS = new Set(['--tail', '--from', '--to', '--format'])

async function main(): Promise<void> {
    const cli = cac('@agent-ils/logger')

    cli.command('serve', 'Start the local HTTP JSONL log collector')
        .option('--cwd <dir>', 'Project root, defaults to cwd')
        .option('--host <host>', 'HTTP host', { default: '127.0.0.1' })
        .option('--port <port>', 'HTTP port', { default: 12138 })
        .option('--log-dir <dir>', 'Directory for JSONL log files')
        .option('--file-prefix <name>', 'Default JSONL file prefix', { default: 'agent-ils' })
        .option('--json', 'Print machine-readable startup info')
        .option('--silent', 'Reduce startup output')
        .action((options: ServeOptions) => serve(options))

    cli.command('read', 'Read recent JSONL log records')
        .option('--cwd <dir>', 'Project root, defaults to cwd')
        .option('--log-dir <dir>', 'Directory for JSONL log files')
        .option('--tail <n>', 'Read the tail n records', { default: 50 })
        .option('--from <time>', 'Start time: epoch ms or ISO timestamp')
        .option('--to <time>', 'End time: epoch ms or ISO timestamp')
        .option('--format <format>', 'text, json, jsonl, markdown', { default: 'text' })
        .action((options: ReadOptions) => read(options))

    cli.help()
    cli.version(VERSION)
    cli.parse(['node', 'agent-ils-logger', ...normalizeArgs(process.argv.slice(2))])
}

async function serve(options: ServeOptions): Promise<void> {
    const paths = await ensureLogDir({ cwd: options.cwd, logDir: options.logDir })
    const port = Number(options.port ?? 12138)
    const handle = await startHttpLogServer({
        host: options.host ?? '127.0.0.1',
        port,
        logDir: paths.logDir,
        filePrefix: options.filePrefix ?? 'agent-ils',
    })

    const output = {
        ok: true,
        endpoint: handle.url,
        logDir: handle.logDir,
        read: 'npx @agent-ils/logger read --tail 50',
    }

    if (options.json) writeStdout(JSON.stringify(output, null, 2))
    else if (!options.silent) {
        writeStdout('AgentILS Logger server ready')
        writeStdout(`endpoint: ${handle.url}`)
        writeStdout(`logDir: ${handle.logDir}`)
        writeStdout('read: npx @agent-ils/logger read --tail 50')
    }

    await waitForShutdown(handle.close)
}

async function read(options: ReadOptions): Promise<void> {
    const records = await readLogRecords({
        ...options,
        tail: numberOption(options.tail),
    })
    writeStdout(formatLogRecords(records, options.format ?? 'text'))
}

function writeStdout(value: string): void {
    process.stdout.write(`${value}\n`)
}

function writeStderr(value: string): void {
    process.stderr.write(`${value}\n`)
}

function normalizeArgs(args: string[]): string[] {
    if (!args.length) return ['serve']
    if (args.includes('--help') || args.includes('-h') || args.includes('--version') || args.includes('-v')) return args
    const first = args[0]
    if (!first.startsWith('-')) return args
    if (args.some((arg) => READ_FLAGS.has(arg))) return ['read', ...args]
    return ['serve', ...args]
}

function numberOption(value: string | number | undefined): number | undefined {
    if (value === undefined) return undefined
    const parsed = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
}

function readPackageVersion(): string {
    try {
        const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
            version?: unknown
        }
        return typeof packageJson.version === 'string' ? packageJson.version : '0.0.0'
    } catch {
        return '0.0.0'
    }
}

function waitForShutdown(close: () => Promise<void>): Promise<void> {
    return new Promise((resolve) => {
        const shutdown = () => {
            void close().finally(() => resolve())
        }
        process.once('SIGINT', shutdown)
        process.once('SIGTERM', shutdown)
    })
}

main().catch((error) => {
    writeStderr(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
})
