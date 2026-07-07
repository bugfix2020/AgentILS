import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { createBrowserLogger } from '../dist/browser.js'
import { createHttpLogger, startHttpLogServer } from '../dist/index.js'
import { readLogRecords } from '../dist/query.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(__dirname, '..')

test('createHttpLogger records group boundaries and active group context', async () => {
    const port = await getFreePort()
    const logDir = await mkdtemp(join(tmpdir(), 'agentils-logger-group-'))
    const server = await startHttpLogServer({ port, logDir })
    const logger = createHttpLogger({
        source: 'frontend',
        endpoint: `http://127.0.0.1:${port}`,
        defaultFields: { traceId: 'trace-001' },
    })

    try {
        logger.group('load users', { screen: 'users' })
        logger.info('api.response', { url: '/api/users', status: 200 })
        logger.groupEnd()

        const records = await waitForRecords(logDir, 3)
        assert.deepEqual(
            records.map((record) => record.event ?? record.message),
            ['group.start', 'api.response', 'group.end'],
        )
        assert.equal(records[0].fields.group, 'load users')
        assert.deepEqual(records[1].fields.groupPath, ['load users'])
        assert.equal(records[1].fields.groupDepth, 1)
        assert.equal(records[1].fields.traceId, 'trace-001')
        assert.equal(records[1].traceId, undefined)
        assert.equal(records[2].fields.group, 'load users')
    } finally {
        await server.close()
        await rm(logDir, { recursive: true, force: true })
    }
})

test('createHttpLogger keeps defaultFields traceId in fields and supports explicit top-level traceId', async () => {
    const port = await getFreePort()
    const logDir = await mkdtemp(join(tmpdir(), 'agentils-logger-trace-'))
    const server = await startHttpLogServer({ port, logDir })
    const logger = createHttpLogger({
        source: 'frontend',
        endpoint: `http://127.0.0.1:${port}`,
        defaultFields: { traceId: 'field-trace' },
        traceId: 'option-trace',
    })

    try {
        logger.info('api.request', { url: '/api/users' })
        logger.info('api.response', { url: '/api/users', traceId: 'call-trace' })

        const records = await waitForRecords(logDir, 2)
        assert.equal(records[0].fields.traceId, 'field-trace')
        assert.equal(records[0].traceId, 'option-trace')
        assert.equal(records[1].fields.traceId, 'call-trace')
        assert.equal(records[1].traceId, 'call-trace')
    } finally {
        await server.close()
        await rm(logDir, { recursive: true, force: true })
    }
})

test('collector returns file locations after successful writes', async () => {
    const port = await getFreePort()
    const scratchRoot = join(packageRoot, '.tmp-logger-location')
    await rm(scratchRoot, { recursive: true, force: true })
    await mkdir(scratchRoot, { recursive: true })
    const logDir = await mkdtemp(join(scratchRoot, 'logs-'))
    const server = await startHttpLogServer({ port, logDir })
    const endpoint = `http://127.0.0.1:${port}`
    const fileName = 'llm-location.jsonl'

    try {
        const first = await postLog(endpoint, {
            source: 'browser',
            level: 'info',
            event: 'state.transition',
            message: 'state.transition',
            fileName,
            fields: { from: 'idle', to: 'loading' },
        })
        const second = await postLog(endpoint, {
            source: 'browser',
            level: 'warn',
            event: 'api.slow',
            message: 'api.slow',
            fileName,
            fields: { url: '/api/users', costMs: 3500 },
        })

        assert.equal(first.record.fileName, fileName)
        assert.equal(first.record.line, 1)
        assert.equal(first.record.location, `${first.record.filePath}:1`)
        assert.equal(first.record.relativeLocation, `${first.record.relativePath}:1`)
        assert.equal(second.record.line, 2)
        assert.equal(second.record.location, `${second.record.filePath}:2`)
        assert.equal(second.record.relativeLocation, `${second.record.relativePath}:2`)
        assert.ok(second.record.relativePath.startsWith('./'))

        const records = (await readLogRecords({ logDir, tail: 2 })).sort((left, right) => left.seq - right.seq)
        assert.equal(records[1].line, 2)
        assert.equal(records[1].location, second.record.location)
        assert.equal(records[1].relativeLocation, second.record.relativeLocation)
    } finally {
        await server.close()
        await rm(scratchRoot, { recursive: true, force: true })
    }
})

test('collector appends after existing unterminated JSONL without rereading each write', async () => {
    const port = await getFreePort()
    const scratchRoot = join(packageRoot, '.tmp-logger-append-state')
    await rm(scratchRoot, { recursive: true, force: true })
    await mkdir(scratchRoot, { recursive: true })
    const logDir = await mkdtemp(join(scratchRoot, 'logs-'))
    const fileName = 'append-state.jsonl'
    await writeFile(join(logDir, fileName), '{"ts":"2026-04-30T10:00:00.000Z","level":"info"}')
    const server = await startHttpLogServer({ port, logDir })
    const endpoint = `http://127.0.0.1:${port}`

    try {
        const first = await postLog(endpoint, {
            source: 'browser',
            level: 'info',
            event: 'api.response',
            message: 'api.response',
            fileName,
            fields: { status: 200 },
        })
        const second = await postLog(endpoint, {
            source: 'browser',
            level: 'warn',
            event: 'api.slow',
            message: 'api.slow',
            fileName,
            fields: { costMs: 3500 },
        })

        assert.equal(first.record.line, 2)
        assert.equal(second.record.line, 3)
        assert.equal(first.record.relativeLocation, `${first.record.relativePath}:2`)
        assert.equal(second.record.relativeLocation, `${second.record.relativePath}:3`)
    } finally {
        await server.close()
        await rm(scratchRoot, { recursive: true, force: true })
    }
})

test('browser logger treats non-AgentILS health responses as unready', async () => {
    const requests = []
    const fetchImpl = async (input, init = {}) => {
        const url = String(input)
        requests.push({ url, method: init.method ?? 'GET' })
        if (url.endsWith('/api/health')) {
            return new globalThis.Response(JSON.stringify({ ok: true, name: 'other-service' }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            })
        }
        if (url.endsWith('/api/logs')) {
            return new globalThis.Response(JSON.stringify({ ok: false, error: 'not-found' }), {
                status: 404,
                headers: { 'content-type': 'application/json' },
            })
        }
        return new globalThis.Response('', { status: 404 })
    }
    const logger = createBrowserLogger({
        endpoint: 'http://127.0.0.1:12138',
        source: 'frontend',
        fetchImpl,
    })

    const first = await logger.info('api.request', { url: '/api/users' })
    await waitForProbe()
    const result = await logger.info('api.response', { url: '/api/users', status: 200 })

    assert.deepEqual(first, { ok: true, status: 204 })
    assert.deepEqual(result, { ok: true, status: 204 })
    assert.equal(
        requests.some((request) => request.url.endsWith('/api/logs')),
        false,
    )
})

test('browser logger posts only after AgentILS health response', async () => {
    const requests = []
    const fetchImpl = async (input, init = {}) => {
        const url = String(input)
        requests.push({ url, method: init.method ?? 'GET' })
        if (url.endsWith('/api/health')) {
            return new globalThis.Response(JSON.stringify({ ok: true, name: 'agentils-logger' }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            })
        }
        if (url.endsWith('/api/logs')) {
            return new globalThis.Response(
                JSON.stringify({
                    ok: true,
                    record: {
                        relativePath: './.agent-ils/logger/logs/frontend-2026-04-30.jsonl',
                        line: 34,
                        relativeLocation: './.agent-ils/logger/logs/frontend-2026-04-30.jsonl:34',
                    },
                }),
                { status: 200, headers: { 'content-type': 'application/json' } },
            )
        }
        return new globalThis.Response('', { status: 404 })
    }
    const logger = createBrowserLogger({
        endpoint: 'http://127.0.0.1:12138',
        source: 'frontend',
        fetchImpl,
    })

    const first = await logger.info('api.request', { url: '/api/users' })
    await waitForProbe()
    const result = await logger.info('api.response', { url: '/api/users', status: 200 })

    assert.deepEqual(first, { ok: true, status: 204 })
    assert.equal(result.ok, true)
    assert.equal(result.status, 200)
    assert.equal(result.record.relativeLocation, './.agent-ils/logger/logs/frontend-2026-04-30.jsonl:34')
    assert.equal(
        requests.some((request) => request.url.endsWith('/api/logs')),
        true,
    )
})

test('CLI skips stale PATH binaries and uses version-matched cache binary', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'agentils-logger-cli-'))
    const pathDir = join(tmpRoot, 'path-bin')
    const homeDir = join(tmpRoot, 'home')
    const platformArch = getPlatformArch()
    const binaryName = process.platform === 'win32' ? 'agent-ils-logger.exe' : 'agent-ils-logger'
    const cachedBinaryName =
        process.platform === 'win32'
            ? `agent-ils-logger-${platformArch}-0.2.0.exe`
            : `agent-ils-logger-${platformArch}-0.2.0`
    const stalePathBinary = join(pathDir, binaryName)
    const cacheBinary = join(homeDir, '.agent-ils', 'bin', cachedBinaryName)

    try {
        await writeExecutable(stalePathBinary, 'agent-ils-logger 0.1.2')
        await writeExecutable(cacheBinary, 'agent-ils-logger 0.2.0')

        const output = await execNode(join(packageRoot, 'dist', 'cli.js'), ['--version'], {
            env: {
                ...process.env,
                HOME: homeDir,
                USERPROFILE: homeDir,
                PATH: `${pathDir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
            },
        })

        assert.match(output.stdout, /agent-ils-logger 0\.2\.0/)
        assert.doesNotMatch(output.stdout, /0\.1\.2/)
    } finally {
        await rm(tmpRoot, { recursive: true, force: true })
    }
})

function getPlatformArch() {
    if (process.platform === 'darwin' && process.arch === 'arm64') return 'darwin-arm64'
    if (process.platform === 'darwin' && process.arch === 'x64') return 'darwin-amd64'
    if (process.platform === 'linux' && process.arch === 'x64') return 'linux-amd64'
    if (process.platform === 'win32' && process.arch === 'x64') return 'windows-amd64'
    throw new Error(`Unsupported test platform: ${process.platform}-${process.arch}`)
}

function getFreePort() {
    return new Promise((resolve, reject) => {
        const server = createServer()
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => {
            const address = server.address()
            server.close((error) => {
                if (error) reject(error)
                else if (address && typeof address === 'object') resolve(address.port)
                else reject(new Error('Failed to allocate test port'))
            })
        })
    })
}

async function waitForRecords(logDir, count) {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 2_000) {
        const records = await readLogRecords({ logDir, tail: count })
        if (records.length >= count) return records.sort((left, right) => left.seq - right.seq)
        await new Promise((resolve) => setTimeout(resolve, 25))
    }
    const records = await readLogRecords({ logDir, tail: count })
    assert.equal(records.length, count)
    return records.sort((left, right) => left.seq - right.seq)
}

async function writeExecutable(filePath, versionOutput) {
    await mkdir(dirname(filePath), { recursive: true })
    const content =
        process.platform === 'win32' ? `@echo off\r\necho ${versionOutput}\r\n` : `#!/bin/sh\necho "${versionOutput}"\n`
    await writeFile(filePath, content, { mode: 0o755 })
}

async function postLog(endpoint, payload) {
    const response = await fetch(`${endpoint}/api/logs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
    })
    const body = await response.json()
    assert.equal(response.ok, true)
    assert.equal(body.ok, true)
    return body
}

function waitForProbe() {
    return new Promise((resolve) => setTimeout(resolve, 25))
}

function execNode(script, args, options) {
    return new Promise((resolve, reject) => {
        execFile(process.execPath, [script, ...args], options, (error, stdout, stderr) => {
            if (error) {
                error.stdout = stdout
                error.stderr = stderr
                reject(error)
                return
            }
            resolve({ stdout, stderr })
        })
    })
}
