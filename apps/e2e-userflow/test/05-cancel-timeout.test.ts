/**
 * userflow #5 — End-to-end proof that B2 (cancel / heartbeat-timeout signal
 * preservation across the HTTP boundary) is fixed at the **real** client API
 * surface that the VS Code extension uses (`AgentilsClient.park`).
 *
 * Before the fix:  client throws `Error('agentils park failed: 500')`
 * After  the fix:  client throws `Error('cancelled')` / `Error('heartbeat-timeout')`
 *
 * That exact-string match is what `registerTools.ts` uses to map errors into
 * `LanguageModelToolResult({cancelled:true})` rather than failing the tool call.
 */
import { fork, type ChildProcess } from 'node:child_process'
import { setTimeout as wait } from 'node:timers/promises'
import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { AgentilsClient } from '@agent-ils/mcp/client'
import { REPO_ROOT } from './helpers/paths.ts'

interface BootInfo {
    port: number
}

async function bootMcp(stateDir: string, heartbeatMs: number): Promise<{ child: ChildProcess; info: BootInfo }> {
    const launcher = join(REPO_ROOT, 'apps', 'e2e-userflow', 'test', 'helpers', 'launch-mcp.mjs')
    const child = fork(launcher, [], {
        env: {
            ...process.env,
            AGENTILS_STATE_PATH: join(stateDir, 'state.json'),
            AGENTILS_HEARTBEAT_MS: String(heartbeatMs),
            AGENTILS_SWEEP_MS: '100',
        },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })
    return new Promise((resolve, reject) => {
        const onMsg = (m: unknown) => {
            const msg = m as { type?: string; port?: number }
            if (msg && msg.type === 'ready' && typeof msg.port === 'number') {
                child.off('message', onMsg)
                resolve({ child, info: { port: msg.port } })
            }
        }
        child.on('message', onMsg)
        child.once('error', reject)
        child.once('exit', (code) => {
            if (code !== null) reject(new Error(`mcp exited early with code=${code}`))
        })
    })
}

async function shutdown(child: ChildProcess): Promise<void> {
    if (!child.killed) child.kill()
    await new Promise<void>((r) => child.once('exit', () => r()))
}

test('user-flow #5a: AgentilsClient.park throws Error("cancelled") after HTTP cancel', async (t) => {
    const dir = await mkdtemp(join(tmpdir(), 'agentils-userflow5a-'))
    t.after(() => rm(dir, { recursive: true, force: true }))
    const { child, info } = await bootMcp(dir, 60_000)
    t.after(() => shutdown(child))

    const baseUrl = `http://127.0.0.1:${info.port}`
    const client = new AgentilsClient({ baseUrl })

    // Park (will block) — issue cancel after a short delay via raw HTTP so the
    // test doesn't depend on the same client for both sides.
    const parkPromise = client.park({
        toolName: 'request_user_clarification',
        question: 'cancel-me',
    })

    // Wait until the request appears in pending, then cancel by id.
    await wait(100)
    const pendingRes = await fetch(`${baseUrl}/api/requests/pending`)
    const { requests } = (await pendingRes.json()) as { requests: { id: string }[] }
    assert.equal(requests.length, 1, 'one parked request expected')
    await fetch(`${baseUrl}/api/requests/${requests[0].id}/cancel`, { method: 'POST' })

    await assert.rejects(parkPromise, (err: Error) => {
        assert.equal(err.message, 'cancelled', `expected exact "cancelled" message, got "${err.message}"`)
        return true
    })
})

test('user-flow #5b: AgentilsClient.park throws Error("heartbeat-timeout") after sweep', async (t) => {
    const dir = await mkdtemp(join(tmpdir(), 'agentils-userflow5b-'))
    t.after(() => rm(dir, { recursive: true, force: true }))
    // Use a tiny heartbeat window so sweep fires quickly.
    const { child, info } = await bootMcp(dir, 200)
    t.after(() => shutdown(child))

    const baseUrl = `http://127.0.0.1:${info.port}`
    const client = new AgentilsClient({ baseUrl })

    const parkPromise = client.park({
        toolName: 'request_user_clarification',
        question: 'time-me-out',
    })

    // The sweeper in the launcher runs every 250ms (mirrors src/index.ts) so we
    // wait long enough for at least two sweeps after the heartbeat window.
    await assert.rejects(parkPromise, (err: Error) => {
        assert.equal(err.message, 'heartbeat-timeout', `expected exact "heartbeat-timeout", got "${err.message}"`)
        return true
    })
})
