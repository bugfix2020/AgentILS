import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createBrowserLogger, type BrowserLogPayload } from '../../../packages/logger/src/browser.ts'
import { startHttpLogServer } from '../../../packages/logger/src/index.ts'
import { readLogRecords } from '../../../packages/logger/src/query.ts'

interface MockRequest {
    url: string
    method: string
    payload?: BrowserLogPayload
}

test('browser logger returns 204 and does not POST when health is not AgentILS', async () => {
    const requests: MockRequest[] = []
    const fetchImpl: typeof fetch = async (input, init = {}) => {
        const url = String(input)
        requests.push({ url, method: init.method ?? 'GET' })
        if (url.endsWith('/api/health')) {
            return jsonResponse({ ok: true, name: 'other-service' })
        }
        if (url.endsWith('/api/logs')) {
            return jsonResponse({ ok: false, error: 'not-found' }, 404)
        }
        return jsonResponse({ ok: false, error: 'not-found' }, 404)
    }
    const logger = createBrowserLogger({
        endpoint: 'http://127.0.0.1:12138',
        source: 'frontend',
        fetchImpl,
    })

    const first = await logger.info('api.request', { url: '/api/users' })
    await wait(25)
    const second = await logger.info('api.response', { url: '/api/users', status: 200 })

    assert.equal(first.status, 204)
    assert.equal(second.status, 204)
    assert.equal(
        requests.some((request) => request.url.endsWith('/api/logs')),
        false,
    )
})

test('browser logger POSTs after AgentILS health and exposes path:line', async () => {
    const requests: MockRequest[] = []
    const fetchImpl: typeof fetch = async (input, init = {}) => {
        const url = String(input)
        const payload =
            typeof init.body === 'string' && init.body ? (JSON.parse(init.body) as BrowserLogPayload) : undefined
        requests.push({ url, method: init.method ?? 'GET', payload })
        if (url.endsWith('/api/health')) {
            return jsonResponse({ ok: true, name: 'agentils-logger' })
        }
        if (url.endsWith('/api/logs')) {
            return jsonResponse({
                ok: true,
                record: {
                    filePath: '/tmp/logger-regression/frontend.jsonl',
                    relativePath: './.agent-ils/logger/logs/frontend.jsonl',
                    line: 34,
                    location: '/tmp/logger-regression/frontend.jsonl:34',
                    relativeLocation: './.agent-ils/logger/logs/frontend.jsonl:34',
                },
            })
        }
        return jsonResponse({ ok: false, error: 'not-found' }, 404)
    }
    const logger = createBrowserLogger({
        endpoint: 'http://127.0.0.1:12138',
        source: 'frontend',
        fetchImpl,
    })

    const first = await logger.info('api.request', { url: '/api/users' })
    await wait(25)
    const second = await logger.info('api.response', { url: '/api/users', status: 200 })

    assert.equal(first.status, 204)
    assert.equal(second.status, 200)
    assert.equal(second.record?.relativeLocation, './.agent-ils/logger/logs/frontend.jsonl:34')
    assert.equal(
        requests.some((request) => request.url.endsWith('/api/logs')),
        true,
    )
})

test('browser group/groupEnd emits boundaries and active group fields', async () => {
    const payloads: BrowserLogPayload[] = []
    const fetchImpl: typeof fetch = async (input, init = {}) => {
        const url = String(input)
        if (url.endsWith('/api/health')) {
            return jsonResponse({ ok: true, name: 'agentils-logger' })
        }
        if (url.endsWith('/api/logs')) {
            const payload = JSON.parse(String(init.body ?? '{}')) as BrowserLogPayload
            payloads.push(payload)
            return jsonResponse({ ok: true, record: { relativeLocation: './mock.jsonl:1' } })
        }
        return jsonResponse({ ok: false, error: 'not-found' }, 404)
    }
    const logger = createBrowserLogger({
        endpoint: 'http://127.0.0.1:12138',
        source: 'frontend',
        defaultFields: { screen: 'users' },
        fetchImpl,
    })

    await logger.debug('probe.start')
    await wait(25)
    await logger.group('load users', { route: '/users' })
    await logger.info('api.response', { url: '/api/users', status: 200 })
    await logger.groupEnd()

    assert.deepEqual(
        payloads.map((payload) => payload.event),
        ['group.start', 'api.response', 'group.end'],
    )
    const fields = payloads[1].fields as Record<string, unknown>
    assert.equal(fields.group, 'load users')
    assert.deepEqual(fields.groupPath, ['load users'])
    assert.equal(fields.groupDepth, 1)
    assert.equal(fields.screen, 'users')
})

test('browser enabled=false returns 204 without fetch calls', async () => {
    let fetchCount = 0
    const logger = createBrowserLogger({
        endpoint: 'http://127.0.0.1:12138',
        source: 'frontend',
        enabled: false,
        fetchImpl: async () => {
            fetchCount += 1
            return jsonResponse({ ok: false }, 500)
        },
    })

    const result = await logger.info('api.response', { url: '/api/users', status: 200 })

    assert.equal(result.status, 204)
    assert.equal(fetchCount, 0)
})

test('real collector returns location metadata and query reads it back', async () => {
    const port = await getFreePort()
    const scratchRoot = await mkdtemp(join(tmpdir(), 'agentils-logger-regression-'))
    const logDir = join(scratchRoot, 'logs')
    await mkdir(logDir, { recursive: true })
    const server = await startHttpLogServer({ port, logDir })
    const endpoint = `http://127.0.0.1:${port}`

    try {
        const response = await fetch(`${endpoint}/api/logs`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                source: 'logger-regression',
                level: 'info',
                event: 'raw.http',
                message: 'raw.http',
                fileName: 'logger-regression.jsonl',
                fields: { mode: 'raw-http' },
            }),
        })
        const body = (await response.json()) as {
            ok: boolean
            record: { line: number; location: string; relativeLocation: string }
        }

        assert.equal(response.ok, true)
        assert.equal(body.ok, true)
        assert.equal(body.record.line, 1)
        assert.match(body.record.location, /logger-regression\.jsonl:1$/)
        assert.match(body.record.relativeLocation, /logger-regression\.jsonl:1$/)

        const records = await readLogRecords({ logDir, tail: 1 })
        assert.equal(records[0].line, 1)
        assert.equal(records[0].location, body.record.location)
        assert.equal(records[0].relativeLocation, body.record.relativeLocation)
    } finally {
        await server.close()
        await rm(scratchRoot, { recursive: true, force: true })
    }
})

test('real collector appends after unterminated JSONL and increments cached lines', async () => {
    const port = await getFreePort()
    const scratchRoot = await mkdtemp(join(tmpdir(), 'agentils-logger-regression-append-'))
    const logDir = join(scratchRoot, 'logs')
    const fileName = 'append-state.jsonl'
    await mkdir(logDir, { recursive: true })
    await writeFile(join(logDir, fileName), '{"ts":"2026-04-30T10:00:00.000Z","level":"info"}')
    const server = await startHttpLogServer({ port, logDir })
    const endpoint = `http://127.0.0.1:${port}`

    try {
        const first = await postLog(endpoint, {
            source: 'logger-regression',
            level: 'info',
            event: 'append.first',
            message: 'append.first',
            fileName,
        })
        const second = await postLog(endpoint, {
            source: 'logger-regression',
            level: 'info',
            event: 'append.second',
            message: 'append.second',
            fileName,
        })

        assert.equal(first.record.line, 2)
        assert.equal(second.record.line, 3)
        assert.match(second.record.relativeLocation, /append-state\.jsonl:3$/)
    } finally {
        await server.close()
        await rm(scratchRoot, { recursive: true, force: true })
    }
})

function jsonResponse(body: unknown, status = 200): Response {
    return new globalThis.Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    })
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function getFreePort(): Promise<number> {
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

async function postLog(
    endpoint: string,
    payload: Record<string, unknown>,
): Promise<{ ok: boolean; record: { line: number; relativeLocation: string } }> {
    const response = await fetch(`${endpoint}/api/logs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
    })
    assert.equal(response.ok, true)
    return (await response.json()) as { ok: boolean; record: { line: number; relativeLocation: string } }
}
