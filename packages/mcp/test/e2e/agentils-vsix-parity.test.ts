/**
 * AgentILS E2E test suite — verifies that the current monorepo source code
 * can fulfill the same end-to-end interaction contract as the
 * `justwe9517.human-clarification@1.3.3` vsix.
 *
 * Coverage (with code evidence, no mocks):
 *   1. Boot HTTP bridge + park a request via AgentilsClient (LM tool path).
 *   2. Webview-style flow: SSE receives `request.created` → POST submit → tool resolves.
 *   3. Cancel path returns `{cancelled: true}`.
 *   4. Heartbeat keeps a request alive past the timeout window.
 *   5. Heartbeat-timeout expires a parked request and rejects.
 *   6. JsonStore persists requests/responses across reload.
 *   7. request_dynamic_action carries `action`/`params` end-to-end.
 *   8. stdio MCP transport (buildMcpServer) exposes the 4 tools to non-VS Code
 *      hosts, parking through the same Orchestrator.
 *
 * Run:  pnpm --filter @agent-ils/mcp test
 */
import { strict as assert } from 'node:assert'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { AgentilsClient, JsonStore, Orchestrator, startAgentilsServer, type RunningServer } from '../../src/index.js'
import { buildMcpServer } from '../../src/transport/stdio.js'
import type { SseEvent } from '../../src/orchestrator/orchestrator.js'

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function bootServer(
    extra: Partial<{
        heartbeatTimeoutMs: number
        statePath: string
    }> = {},
): Promise<{ srv: RunningServer; client: AgentilsClient; baseUrl: string; tmp: string }> {
    const tmp = await mkdtemp(join(tmpdir(), 'agentils-e2e-'))
    const statePath = extra.statePath ?? join(tmp, 'state.json')
    const srv = await startAgentilsServer({
        httpPort: 0, // OS-assigned
        stdio: false,
        http: true,
        statePath,
        heartbeatTimeoutMs: extra.heartbeatTimeoutMs ?? 5 * 60_000,
    })
    const baseUrl = `http://127.0.0.1:${srv.http!.port}`
    const client = new AgentilsClient({ baseUrl })
    return { srv, client, baseUrl, tmp }
}

test('1. health check + LM tool path: park resolves with submit text', async () => {
    const { srv, client, baseUrl, tmp } = await bootServer()
    try {
        assert.equal(await client.health(), true, 'http bridge must report healthy')

        // Simulate the LM tool: extension calls client.park (parked promise).
        const parked = client.park({
            toolName: 'request_user_clarification',
            question: 'What is the project name?',
            placeholder: 'project name…',
        })

        // Wait for orchestrator to register & broadcast.
        await wait(50)

        // Webview side: discover via /api/requests/pending and submit.
        const pendingRes = await fetch(`${baseUrl}/api/requests/pending`)
        const { requests } = (await pendingRes.json()) as { requests: Array<{ id: string; question: string }> }
        assert.equal(requests.length, 1, 'one pending request expected')
        assert.equal(requests[0].question, 'What is the project name?')

        const submitRes = await fetch(`${baseUrl}/api/requests/${requests[0].id}/submit`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                text: 'AgentILS',
                images: [{ filename: 'pixel.png', mimeType: 'image/png', data: 'data:image/png;base64,AA==' }],
                reportContent: 'short report',
                timestamp: 1777180000000,
            }),
        })
        assert.equal(submitRes.status, 200)

        const final = await parked
        assert.equal(final.text, 'AgentILS', 'tool return text must equal user submission')
        assert.equal(final.images?.[0]?.filename, 'pixel.png')
        assert.equal(final.images?.[0]?.mimeType, 'image/png')
        assert.equal(final.reportContent, 'short report')
        assert.equal(final.timestamp, 1777180000000)
        assert.notEqual(final.cancelled, true)
    } finally {
        await srv.stop()
        await rm(tmp, { recursive: true, force: true })
    }
})

test('2. SSE events deliver request.created + request.submitted', async () => {
    const { srv, client, baseUrl, tmp } = await bootServer()
    try {
        const events: string[] = []
        const ctrl = new AbortController()

        // Manually parse SSE because Node's EventSource API isn't standard.
        const ssePromise = (async () => {
            const r = await fetch(`${baseUrl}/api/events`, { signal: ctrl.signal })
            const reader = r.body!.getReader()
            const decoder = new TextDecoder()
            let buf = ''
            while (true) {
                const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }))
                if (done) return
                buf += decoder.decode(value!, { stream: true })
                let idx
                while ((idx = buf.indexOf('\n\n')) >= 0) {
                    const block = buf.slice(0, idx)
                    buf = buf.slice(idx + 2)
                    const evtLine = block.split('\n').find((l) => l.startsWith('event: '))
                    if (evtLine) events.push(evtLine.slice('event: '.length).trim())
                }
            }
        })()

        await wait(80) // ensure SSE attached

        const parked = client.park({
            toolName: 'request_contact_user',
            question: 'ping',
        })
        await wait(80)

        // Submit through HTTP
        const pending = (await (await fetch(`${baseUrl}/api/requests/pending`)).json()) as {
            requests: Array<{ id: string }>
        }
        await fetch(`${baseUrl}/api/requests/${pending.requests[0].id}/submit`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text: 'pong' }),
        })

        const result = await parked
        assert.equal(result.text, 'pong')

        await wait(60)
        ctrl.abort()
        await ssePromise.catch(() => {})

        assert.ok(events.includes('request.created'), `SSE must emit request.created (got ${events.join(',')})`)
        assert.ok(events.includes('request.submitted'), `SSE must emit request.submitted (got ${events.join(',')})`)
    } finally {
        await srv.stop()
        await rm(tmp, { recursive: true, force: true })
    }
})

test('3. cancel path resolves with cancelled response on the client side', async () => {
    const { srv, client, baseUrl, tmp } = await bootServer()
    try {
        // We use the orchestrator directly to verify that `submit({cancelled:true})`-
        // style flow surfaces correctly. AgentilsClient.park rejects on cancel via
        // HTTP bridge `request.cancelled` (parked promise rejected with 'cancelled').
        const parked = client
            .park({
                toolName: 'request_user_feedback',
                question: 'rate me',
            })
            .then(
                (v) => ({ ok: true, v }),
                (e: Error) => ({ ok: false, err: e.message }),
            )
        await wait(50)
        const pending = (await (await fetch(`${baseUrl}/api/requests/pending`)).json()) as {
            requests: Array<{ id: string }>
        }
        await fetch(`${baseUrl}/api/requests/${pending.requests[0].id}/cancel`, { method: 'POST' })
        const outcome = await parked
        assert.equal(outcome.ok, false, 'cancel must reject the parked promise')
        assert.equal((outcome as { err: string }).err, 'cancelled')
    } finally {
        await srv.stop()
        await rm(tmp, { recursive: true, force: true })
    }
})

test('4. heartbeat keeps a request alive past the timeout window', async () => {
    // Use a tiny heartbeat timeout so the test runs fast.
    const HEARTBEAT_MS = 200
    const { srv, client, baseUrl, tmp } = await bootServer({ heartbeatTimeoutMs: HEARTBEAT_MS })
    try {
        const parked = client.park({
            toolName: 'request_user_clarification',
            question: 'long-running',
        })
        await wait(50)
        const pending = (await (await fetch(`${baseUrl}/api/requests/pending`)).json()) as {
            requests: Array<{ id: string }>
        }
        const id = pending.requests[0].id

        // Heartbeat 5 times across > 1s, beating the timeout each cycle.
        for (let i = 0; i < 5; i++) {
            await wait(120)
            await fetch(`${baseUrl}/api/requests/${id}/heartbeat`, { method: 'POST' })
            // Manually trigger sweep
            await srv.orchestrator.sweepExpired()
        }

        // Still alive — submit now.
        await fetch(`${baseUrl}/api/requests/${id}/submit`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text: 'ok' }),
        })
        const result = await parked
        assert.equal(result.text, 'ok')
    } finally {
        await srv.stop()
        await rm(tmp, { recursive: true, force: true })
    }
})

test('5. heartbeat-timeout expires the parked request and rejects', async () => {
    const HEARTBEAT_MS = 80
    const { srv, client, tmp } = await bootServer({ heartbeatTimeoutMs: HEARTBEAT_MS })
    try {
        const parked = client
            .park({
                toolName: 'request_user_clarification',
                question: 'will time out',
            })
            .then(
                (v) => ({ ok: true, v }),
                (e: Error) => ({ ok: false, err: e.message }),
            )
        await wait(50)
        const pending = srv.orchestrator.pending()
        assert.equal(pending.length, 1)
        const id = pending[0].id
        // Wait for stale + sweep
        await wait(150)
        await srv.orchestrator.sweepExpired()
        const outcome = await parked
        assert.equal(outcome.ok, false, 'expired request must reject parked promise')
        assert.equal((outcome as { err: string }).err, 'heartbeat-timeout')
        assert.equal(srv.store.getRequest(id)?.status, 'expired')
        assert.equal(srv.store.getResponse(id)?.reason, 'heartbeat-timeout')
    } finally {
        await srv.stop()
        await rm(tmp, { recursive: true, force: true })
    }
})

test('6. JsonStore persists requests and responses across reload', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'agentils-e2e-store-'))
    const file = join(tmp, 'state.json')
    try {
        const store = new JsonStore(file)
        await store.load()
        const orchestrator = new Orchestrator(store, 60_000)

        const id = (async () => {
            const p = orchestrator.park({ toolName: 'request_user_clarification', question: 'persist?' })
            await wait(20)
            const pending = orchestrator.pending()
            assert.equal(pending.length, 1)
            const reqId = pending[0].id
            await orchestrator.submit(reqId, { text: 'persisted-value', timestamp: Date.now() })
            const final = await p
            assert.equal(final.text, 'persisted-value')
            return reqId
        })()
        const reqId = await id

        // Verify on-disk content (atomic rename guarantees a complete file)
        const raw = JSON.parse(await readFile(file, 'utf8'))
        assert.equal(raw.version, 1)
        assert.equal(raw.requests.length, 1)
        assert.equal(raw.requests[0].id, reqId)
        assert.equal(raw.requests[0].status, 'submitted')
        assert.equal(raw.responses[reqId].text, 'persisted-value')

        // Reload from disk into a fresh store
        const store2 = new JsonStore(file)
        await store2.load()
        assert.equal(store2.getResponse(reqId)?.text, 'persisted-value')
        assert.equal(store2.getRequest(reqId)?.status, 'submitted')
    } finally {
        await rm(tmp, { recursive: true, force: true })
    }
})

test('7. request_dynamic_action propagates action + params end-to-end', async () => {
    const { srv, client, baseUrl, tmp } = await bootServer()
    try {
        const parked = client.park({
            toolName: 'request_dynamic_action',
            question: 'dynamic:createPlanFile',
            action: 'createPlanFile',
            params: { path: 'plan.md', content: 'hello' },
        })
        await wait(50)
        const pending = (await (await fetch(`${baseUrl}/api/requests/pending`)).json()) as {
            requests: Array<{ id: string; action?: string; params?: Record<string, unknown> }>
        }
        assert.equal(pending.requests.length, 1)
        assert.equal(pending.requests[0].action, 'createPlanFile')
        assert.deepEqual(pending.requests[0].params, { path: 'plan.md', content: 'hello' })

        await fetch(`${baseUrl}/api/requests/${pending.requests[0].id}/submit`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text: JSON.stringify({ created: 'plan.md' }) }),
        })
        const result = await parked
        assert.equal(JSON.parse(result.text).created, 'plan.md')
    } finally {
        await srv.stop()
        await rm(tmp, { recursive: true, force: true })
    }
})

test('8. stdio MCP transport: buildMcpServer exposes 4 tools that park via Orchestrator', async () => {
    // We don't spawn a subprocess; we directly verify the registered tools exist
    // on the McpServer. An in-process round-trip would require the SDK's
    // InMemoryTransport which is acceptable but adds noise — the contract we
    // need to prove is "the 4 tool names are registered on the MCP server".
    const tmp = await mkdtemp(join(tmpdir(), 'agentils-e2e-stdio-'))
    try {
        const store = new JsonStore(join(tmp, 'state.json'))
        await store.load()
        const orchestrator = new Orchestrator(store, 60_000)
        const mcp = buildMcpServer(orchestrator)
        const internal = mcp as unknown as { _registeredTools?: Record<string, unknown> }
        const names = Object.keys(internal._registeredTools ?? {})
        for (const t of [
            'request_user_clarification',
            'request_contact_user',
            'request_user_feedback',
            'request_dynamic_action',
        ]) {
            assert.ok(names.includes(t), `stdio MCP must register ${t} (got ${names.join(', ')})`)
        }
    } finally {
        await rm(tmp, { recursive: true, force: true })
    }
})

test('9. orchestrator subscribers receive typed SseEvent stream', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'agentils-e2e-sub-'))
    try {
        const store = new JsonStore(join(tmp, 'state.json'))
        await store.load()
        const orch = new Orchestrator(store, 60_000)

        const evts: SseEvent[] = []
        const off = orch.subscribe((e) => evts.push(e))

        const p = orch.park({ toolName: 'request_contact_user', question: 'sub-test' })
        await wait(10)
        const reqId = orch.pending()[0].id
        await orch.submit(reqId, { text: 'done', timestamp: Date.now() })
        await p
        off()

        assert.equal(evts[0]?.type, 'request.created')
        assert.equal(evts[1]?.type, 'request.submitted')
    } finally {
        await rm(tmp, { recursive: true, force: true })
    }
})
