/**
 * E2E user-flow test #2 — boot the real `@agentils/mcp` HTTP bridge and run
 * a complete LM tool round-trip exactly as the VS Code extension would.
 *
 * Steps:
 *   1. Start agentils-mcp child process with `--http` (no stdio).
 *   2. Wait for the printed listening port from stderr.
 *   3. POST /api/requests with a `request_user_clarification` payload (parked).
 *   4. Concurrently GET /api/requests/pending to discover the request id.
 *   5. POST /api/requests/:id/submit { text: 'agentils' } as the user would.
 *   6. Assert the original park call resolves with `{text:'agentils'}`.
 */
import { strict as assert } from 'node:assert'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const LAUNCHER = resolve(dirname(fileURLToPath(import.meta.url)), 'helpers', 'launch-mcp.mjs')

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

interface Booted {
    proc: ChildProcessWithoutNullStreams
    baseUrl: string
    stop: () => Promise<void>
}

/**
 * NOTE: We deliberately invoke a launcher instead of `node packages/mcp/dist/index.js --http`
 * because the CLI bootstrap in packages/mcp/src/index.ts:71 uses
 *   `import.meta.url === \`file://${process.argv[1]}\``
 * which is **always false on Windows** (no URL normalization). That's a real
 * cross-platform bug; documenting it here so future runs catch it.
 */
async function bootMcp(extraEnv: Record<string, string> = {}): Promise<Booted> {
    const tmp = await mkdtemp(join(tmpdir(), 'agentils-userflow-mcp-'))
    const proc = spawn(process.execPath, [LAUNCHER], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, ...extraEnv, AGENTILS_STATE_DIR_HINT: tmp },
    }) as ChildProcessWithoutNullStreams

    let stderr = ''
    const portReady = new Promise<string>((resolveP, reject) => {
        const onData = (chunk: Buffer) => {
            stderr += chunk.toString()
            const m = stderr.match(/http bridge listening on (http:\/\/127\.0\.0\.1:\d+)/)
            if (m) {
                proc.stderr.off('data', onData)
                resolveP(m[1])
            }
        }
        proc.stderr.on('data', onData)
        proc.once('exit', (code) => reject(new Error(`mcp exited early (${code}); stderr:\n${stderr}`)))
        setTimeout(() => reject(new Error(`mcp did not announce port within 10s; stderr:\n${stderr}`)), 10_000)
    })

    const baseUrl = await portReady
    return {
        proc,
        baseUrl,
        stop: async () => {
            proc.kill('SIGTERM')
            await new Promise<void>((r) => {
                proc.once('exit', () => r())
                setTimeout(() => {
                    try {
                        proc.kill('SIGKILL')
                    } catch {}
                    r()
                }, 2000)
            })
            await rm(tmp, { recursive: true, force: true })
        },
    }
}

test('user-flow: real mcp child process + http LM tool round-trip', async () => {
    const booted = await bootMcp()
    try {
        const baseUrl = booted.baseUrl

        // health
        const h = await fetch(`${baseUrl}/api/health`)
        assert.equal(h.status, 200)
        assert.equal(((await h.json()) as { ok: boolean }).ok, true)

        // park (parked promise)
        const parkPromise = fetch(`${baseUrl}/api/requests`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                toolName: 'request_user_clarification',
                question: 'project name?',
            }),
        }).then(async (r) => {
            assert.equal(r.status, 200, 'park must return 200 on submit success')
            return (await r.json()) as { ok: boolean; response: { text: string } }
        })

        // give the server a tick to register
        await wait(80)
        const pending = (await (await fetch(`${baseUrl}/api/requests/pending`)).json()) as {
            requests: Array<{ id: string; question: string }>
        }
        assert.equal(pending.requests.length, 1)
        assert.equal(pending.requests[0].question, 'project name?')
        const id = pending.requests[0].id

        // user submits
        const submit = await fetch(`${baseUrl}/api/requests/${id}/submit`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text: 'agentils' }),
        })
        assert.equal(submit.status, 200)

        const finalRes = await parkPromise
        assert.equal(finalRes.ok, true)
        assert.equal(finalRes.response.text, 'agentils')
    } finally {
        await booted.stop()
    }
})
