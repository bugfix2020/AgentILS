/**
 * E2E user-flow test #4 — REAL "LLM calls MCP tool" path, no mocks.
 *
 * The stdio MCP server's tool handler (src/transport/stdio.ts:25-44) IS the
 * code path a real LLM (Copilot, Claude Desktop, Cursor, etc.) executes when
 * it issues `tools/call`. We exercise it here:
 *
 *   1. Boot ONE process that runs both stdio MCP and HTTP bridge sharing the
 *      same Orchestrator (mirroring `agentils-mcp --stdio --http`).
 *   2. Over stdio JSON-RPC, send `tools/call` for `request_user_clarification`
 *      — the same payload an LLM would emit. The handler will park.
 *   3. Concurrently, on HTTP, the "user" submits via /api/requests/:id/submit.
 *   4. The original `tools/call` response unblocks and returns
 *      `{content:[{type:'text', text:'<user reply>'}]}` — exactly what the
 *      LLM consumes as the tool result.
 *
 * This is the real LM round-trip without `@vscode/test-electron`, because
 * VS Code Chat ↔ MCP servers speak the same JSON-RPC protocol over stdio.
 */
import { strict as assert } from 'node:assert'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const LAUNCHER = resolve(dirname(fileURLToPath(import.meta.url)), 'helpers', 'launch-mcp-stdio-http.mjs')

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

interface JsonRpcResponse {
    jsonrpc: '2.0'
    id: number
    result?: { content?: Array<{ type: string; text: string }> }
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
                    /* ignore non-JSON */
                }
            }
        })
    }

    request(method: string, params?: unknown, timeoutMs = 8000): Promise<JsonRpcResponse> {
        const id = this.nextId++
        this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
        return new Promise<JsonRpcResponse>((resolveP, reject) => {
            this.waiters.set(id, resolveP)
            setTimeout(() => {
                if (this.waiters.delete(id)) reject(new Error(`stdio request "${method}" timed out`))
            }, timeoutMs)
        })
    }
}

test('user-flow LM PATH: real stdio tools/call request_user_clarification round-trip', async () => {
    const proc = spawn(process.execPath, [LAUNCHER], {
        stdio: ['pipe', 'pipe', 'pipe'],
    }) as ChildProcessWithoutNullStreams

    let stderr = ''
    // Wait for the launcher to print `port=<n>` to stdout for the HTTP bridge.
    // We can't read the port from stdout because stdout is reserved for MCP
    // JSON-RPC. So the launcher writes the port to stderr instead.
    let httpUrl = ''
    const portReady = new Promise<void>((resolveP, reject) => {
        const onErr = (chunk: Buffer) => {
            stderr += chunk.toString()
            const m = stderr.match(/http=(http:\/\/127\.0\.0\.1:\d+)/)
            if (m) {
                httpUrl = m[1]
                resolveP()
            }
        }
        proc.stderr.on('data', onErr)
        setTimeout(() => reject(new Error(`launcher didn't report http port. stderr:\n${stderr}`)), 8000)
    })

    try {
        await portReady
        const client = new StdioMcpClient(proc)
        await wait(80)

        const init = await client.request('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'e2e-userflow-lm', version: '0.0.0' },
        })
        assert.ok(init.result, `initialize failed: ${JSON.stringify(init.error)}\nstderr:\n${stderr}`)

        proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')

        // ---- THE REAL LM PATH ----
        // Issue tools/call exactly as Copilot Chat / Claude Desktop would.
        // This kicks the stdio handler in src/transport/stdio.ts which calls
        // orchestrator.park (the same function the VS Code extension's
        // registerTools.ts:invoke handler calls via HTTP). The response is the
        // exact LanguageModelToolResult-equivalent the LLM consumes.
        const toolCallPromise = client.request(
            'tools/call',
            {
                name: 'request_user_clarification',
                arguments: { question: 'project name?' },
            },
            15_000,
        )

        // Concurrently, the "user" answers via the webview/HTTP bridge.
        await wait(120)
        const pending = (await (await fetch(`${httpUrl}/api/requests/pending`)).json()) as {
            requests: Array<{ id: string; question: string; toolName: string }>
        }
        assert.equal(pending.requests.length, 1, 'one parked request expected')
        assert.equal(pending.requests[0].question, 'project name?')
        assert.equal(pending.requests[0].toolName, 'request_user_clarification')

        const sub = await fetch(`${httpUrl}/api/requests/${pending.requests[0].id}/submit`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text: 'agentils' }),
        })
        assert.equal(sub.status, 200)

        // ---- ASSERT THE LLM-VISIBLE RESPONSE ----
        const toolCall = await toolCallPromise
        assert.ok(toolCall.result, `tools/call failed: ${JSON.stringify(toolCall.error)}`)
        const content = toolCall.result.content
        assert.ok(Array.isArray(content) && content.length > 0, 'content must be a non-empty array')
        assert.equal(content[0].type, 'text')
        assert.equal(content[0].text, 'agentils', 'LLM-visible tool result must equal user reply')
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
    }
})
