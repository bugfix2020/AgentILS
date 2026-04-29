/**
 * E2E user-flow test #3 — real stdio MCP transport, the path that
 * `.vscode/mcp.json` declares (`{"command":"npx","args":["-y","@agentils/mcp","--stdio"]}`).
 *
 * We spawn `node packages/mcp/dist/index.js --stdio` and speak the bare
 * MCP newline-delimited JSON-RPC subset:
 *   1. initialize
 *   2. tools/list  → must return the 4 AgentILS tools
 *   3. tools/call  request_user_clarification → parks (we don't drive a UI here,
 *      so we just verify the call hangs as expected and we can cancel by killing
 *      the process; OR — better — we use a side-channel: start the HTTP bridge
 *      simultaneously so the test can submit through HTTP and unblock the parked
 *      stdio call). The MCP server entry script supports both transports
 *      together when invoked without --stdio-only, so we use that mode.
 */
import { strict as assert } from 'node:assert'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Same Windows `isCli` issue as in 02-mcp-roundtrip.test.ts — we must use a
 * launcher that imports the public API instead of running the dist entry as
 * a CLI. We expose a tiny stdio launcher next to launch-mcp.mjs.
 */
const LAUNCHER = resolve(dirname(fileURLToPath(import.meta.url)), 'helpers', 'launch-mcp-stdio.mjs')

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

interface JsonRpcResponse {
    jsonrpc: '2.0'
    id: number
    result?: unknown
    error?: { code: number; message: string }
}

class StdioMcpClient {
    private buf = ''
    private nextId = 1
    private readonly waiters = new Map<number, (msg: JsonRpcResponse) => void>()

    constructor(private readonly proc: ChildProcessWithoutNullStreams) {
        proc.stdout.on('data', (chunk: Buffer) => {
            this.buf += chunk.toString()
            let idx
            while ((idx = this.buf.indexOf('\n')) >= 0) {
                const line = this.buf.slice(0, idx).trim()
                this.buf = this.buf.slice(idx + 1)
                if (!line) continue
                try {
                    const msg = JSON.parse(line) as JsonRpcResponse
                    if (typeof msg.id === 'number') {
                        const w = this.waiters.get(msg.id)
                        if (w) {
                            this.waiters.delete(msg.id)
                            w(msg)
                        }
                    }
                } catch {
                    /* ignore non-JSON line */
                }
            }
        })
    }

    request(method: string, params?: unknown): Promise<JsonRpcResponse> {
        const id = this.nextId++
        const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params })
        this.proc.stdin.write(payload + '\n')
        return new Promise<JsonRpcResponse>((resolveP, reject) => {
            this.waiters.set(id, resolveP)
            setTimeout(() => {
                if (this.waiters.delete(id)) reject(new Error(`stdio request "${method}" timed out`))
            }, 8000)
        })
    }
}

test('user-flow: stdio MCP transport exposes 4 AgentILS tools (initialize + tools/list)', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'agentils-userflow-stdio-'))
    // Start with both transports so we keep stdio attached to OUR pipe and HTTP
    // available for a future round-trip extension (not exercised here).
    const proc = spawn(process.execPath, [LAUNCHER], {
        stdio: ['pipe', 'pipe', 'pipe'],
    }) as ChildProcessWithoutNullStreams

    // Surface stderr to test output if something goes wrong.
    let stderr = ''
    proc.stderr.on('data', (d) => (stderr += d.toString()))

    try {
        const client = new StdioMcpClient(proc)
        await wait(120)

        const init = await client.request('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'e2e-userflow', version: '0.0.0' },
        })
        assert.ok(init.result, `initialize failed: ${JSON.stringify(init.error)}\nstderr:\n${stderr}`)

        // notifications/initialized is one-way per MCP spec — but for the test we
        // don't strictly need it to call tools/list with this SDK build. Try anyway.
        proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')

        const list = await client.request('tools/list', {})
        assert.ok(list.result, `tools/list failed: ${JSON.stringify(list.error)}`)
        const tools = (list.result as { tools: Array<{ name: string }> }).tools
        const names = tools.map((t) => t.name).sort()
        assert.deepEqual(names, [
            'request_contact_user',
            'request_dynamic_action',
            'request_user_clarification',
            'request_user_feedback',
        ])
    } finally {
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
    }
})
