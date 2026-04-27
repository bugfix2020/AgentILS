/**
 * Real-extension-host LM tool test.
 *
 * What this proves (the gap from previous E2E tests):
 *
 *   ✓ The `vscode` module is the **actual** VS Code API (loaded inside the
 *     extension host process), NOT a mock.
 *   ✓ `vscode.lm.tools` lists all four tools that
 *     `packages/extensions/agentils-vscode/src/tools/registerTools.ts`
 *     registered via `vscode.lm.registerTool` during `activate()`.
 *   ✓ A tool invocation through `vscode.lm.invokeTool` walks the EXACT
 *     `invoke` callback the LLM would call, including the `prepareInvocation`
 *     auto-confirmation path, and ultimately constructs a real
 *     `LanguageModelToolResult` containing a `LanguageModelTextPart`.
 *   ✓ End-to-end the user-submitted text round-trips back into that
 *     ToolResult — which is what the LLM consumes.
 */
'use strict'

const assert = require('assert')
const vscode = require('vscode')

const TOOL_NAMES = [
    'agentils_request_user_clarification',
    'agentils_request_contact_user',
    'agentils_request_user_feedback',
    'agentils_request_dynamic_action',
]

async function waitForActivation(timeoutMs = 30000) {
    const started = Date.now()
    const ext = vscode.extensions.getExtension('agentils.agentils-vscode')
    assert.ok(ext, 'extension agentils.agentils-vscode must be installed (extensionDevelopmentPath)')
    // `await ext.activate()` returns the exports value directly. We cache it
    // because `ext.exports` may be lazily populated in some VS Code versions.
    const api = ext.isActive ? ext.exports : await ext.activate()
    module.exports.__api = api || ext.exports
    while (Date.now() - started < timeoutMs) {
        const names = (vscode.lm.tools || []).map((t) => t.name)
        if (TOOL_NAMES.every((n) => names.includes(n))) return
        await new Promise((r) => setTimeout(r, 200))
    }
    const got = (vscode.lm.tools || []).map((t) => t.name)
    throw new Error(`timeout waiting for tools to register; saw: ${JSON.stringify(got)}`)
}

suite('AgentILS extension — real VS Code host', () => {
    suiteSetup(async function () {
        this.timeout(60000)
        await waitForActivation()
    })

    test('all four LM tools are registered with vscode.lm', () => {
        const names = (vscode.lm.tools || []).map((t) => t.name)
        for (const n of TOOL_NAMES) {
            assert.ok(names.includes(n), `expected ${n} to be in vscode.lm.tools (got ${JSON.stringify(names)})`)
        }
    })

    test('vscode.lm.invokeTool round-trips through the real invoke callback', async function () {
        this.timeout(30000)
        const ext = vscode.extensions.getExtension('agentils.agentils-vscode')
        const api = (ext && ext.exports) || module.exports.__api
        assert.ok(api && api.baseUrl, 'extension must export baseUrl')
        const baseUrl = api.baseUrl
        // sanity probe
        const h = await fetch(baseUrl + '/api/health')
        assert.ok(h.ok, 'MCP HTTP bridge health check failed')

        // Pre-arm the submitter: as soon as a request appears in pending, POST
        // its submit endpoint with our reply text.
        const replyText = 'real-vscode-host-' + Date.now()
        const submitterPromise = (async () => {
            const deadline = Date.now() + 15000
            while (Date.now() < deadline) {
                const r = await fetch(baseUrl + '/api/requests/pending')
                const j = await r.json()
                if (j.requests && j.requests.length > 0) {
                    await fetch(baseUrl + '/api/requests/' + j.requests[0].id + '/submit', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ text: replyText }),
                    })
                    return j.requests[0].id
                }
                await new Promise((r2) => setTimeout(r2, 100))
            }
            throw new Error('submitter timed out — no pending request appeared')
        })()

        // Real LM tool invocation (this is exactly what Copilot Chat does).
        const result = await vscode.lm.invokeTool('agentils_request_user_clarification', {
            input: { question: 'What is the meaning of life?' },
            toolInvocationToken: undefined,
        })

        await submitterPromise

        assert.ok(result, 'invokeTool returned no result')
        assert.ok(Array.isArray(result.content), 'result.content must be an array')
        // Find the first text part (compatible across VS Code minor versions).
        const text = (result.content || [])
            .map((p) => (typeof p.value === 'string' ? p.value : p.text || ''))
            .filter(Boolean)
            .join('')
        assert.strictEqual(text, replyText, 'LLM-visible tool result text must equal user-submitted text')
    })

    // ---- C: 4 tools full coverage + cancel + heartbeat-timeout ----

    function getApi() {
        const ext = vscode.extensions.getExtension('agentils.agentils-vscode')
        return (ext && ext.exports) || module.exports.__api
    }

    async function autoSubmit(baseUrl, text, deadlineMs = 15000) {
        const deadline = Date.now() + deadlineMs
        while (Date.now() < deadline) {
            const r = await fetch(baseUrl + '/api/requests/pending')
            const j = await r.json()
            if (j.requests && j.requests.length > 0) {
                const id = j.requests[0].id
                const sr = await fetch(baseUrl + '/api/requests/' + id + '/submit', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ text }),
                })
                if (!sr.ok) throw new Error('submit failed: ' + sr.status)
                return id
            }
            await new Promise((r2) => setTimeout(r2, 80))
        }
        throw new Error('autoSubmit timed out')
    }

    async function autoCancel(baseUrl, deadlineMs = 15000) {
        const deadline = Date.now() + deadlineMs
        while (Date.now() < deadline) {
            const r = await fetch(baseUrl + '/api/requests/pending')
            const j = await r.json()
            if (j.requests && j.requests.length > 0) {
                const id = j.requests[0].id
                const cr = await fetch(baseUrl + '/api/requests/' + id + '/cancel', { method: 'POST' })
                if (!cr.ok) throw new Error('cancel failed: ' + cr.status)
                return id
            }
            await new Promise((r2) => setTimeout(r2, 80))
        }
        throw new Error('autoCancel timed out')
    }

    function extractText(result) {
        return (result.content || [])
            .map((p) => (typeof p.value === 'string' ? p.value : p.text || ''))
            .filter(Boolean)
            .join('')
    }

    for (const toolName of TOOL_NAMES) {
        test('round-trip via vscode.lm.invokeTool — ' + toolName, async function () {
            this.timeout(20000)
            const api = getApi()
            const baseUrl = api.baseUrl
            const reply = `${toolName}-reply-${Date.now()}`
            const submitting = autoSubmit(baseUrl, reply)
            const input =
                toolName === 'agentils_request_dynamic_action'
                    ? { action: 'ask', params: { question: 'pick one' } }
                    : { question: 'real-host-' + toolName }
            const result = await vscode.lm.invokeTool(toolName, { input, toolInvocationToken: undefined })
            await submitting
            assert.ok(result && Array.isArray(result.content), 'result.content must be array')
            assert.strictEqual(extractText(result), reply, toolName + ' must round-trip user text')
        })
    }

    test('cancel branch surfaces structured cancellation through invokeTool', async function () {
        this.timeout(20000)
        const api = getApi()
        const baseUrl = api.baseUrl
        const cancelling = autoCancel(baseUrl)
        const result = await vscode.lm.invokeTool('agentils_request_user_clarification', {
            input: { question: 'will be cancelled' },
            toolInvocationToken: undefined,
        })
        await cancelling
        const text = extractText(result)
        // registerTools serialises a structured object containing a cancellation marker.
        assert.ok(
            /cancel/i.test(text) || /取消|已取消/.test(text),
            'cancel branch should surface a cancellation marker; got: ' + text,
        )
    })

    test('heartbeat-timeout branch surfaces via triggerSweep + short heartbeat', async function () {
        this.timeout(20000)
        const api = getApi()
        if (typeof api.triggerSweep !== 'function') {
            this.skip()
            return
        }
        if (!process.env.AGENTILS_TEST_HEARTBEAT_MS || Number(process.env.AGENTILS_TEST_HEARTBEAT_MS) > 2000) {
            this.skip()
            return
        }
        const baseUrl = api.baseUrl
        const invocation = vscode.lm.invokeTool('agentils_request_user_clarification', {
            input: { question: 'will time out' },
            toolInvocationToken: undefined,
        })
        // Wait for the request to be parked, then for heartbeat to lapse, then sweep.
        await new Promise((r) => setTimeout(r, Number(process.env.AGENTILS_TEST_HEARTBEAT_MS) + 500))
        await api.triggerSweep()
        const result = await invocation
        const text = extractText(result)
        assert.ok(
            /timeout|heartbeat|超时/i.test(text),
            'heartbeat-timeout branch should surface a timeout marker; got: ' + text,
        )
    })

    test('extension exports a recentLogs ring buffer mirroring OutputChannel', () => {
        const api = getApi()
        assert.strictEqual(typeof api.recentLogs, 'function')
        const lines = api.recentLogs()
        assert.ok(Array.isArray(lines), 'recentLogs() must return an array')
        assert.ok(lines.length > 0, 'recentLogs() should contain at least the activate logs')
        assert.ok(
            lines.some((l) => /extension activate done/.test(l)),
            'recentLogs() should contain the "extension activate done" line; got tail: ' + lines.slice(-3).join(' | '),
        )
    })

    test('openWebview() creates a real WebviewPanel rendering the bundled host-mediated UI', async function () {
        this.timeout(15000)
        const api = getApi()
        assert.strictEqual(typeof api.openWebview, 'function', 'extension must export openWebview()')
        const panel = api.openWebview()
        assert.ok(panel, 'openWebview() must return a WebviewPanel')
        assert.strictEqual(panel.viewType, 'agentils')
        // panel.webview.html is set synchronously inside ensurePanel
        const html = panel.webview.html
        assert.ok(
            html && html.length > 100,
            'panel.webview.html must be non-trivial; got length ' + (html && html.length),
        )
        assert.ok(
            !/window\.__AGENTILS_MCP_URL__\s*=/.test(html),
            'webview HTML must not inject a direct MCP bridge URL',
        )
        assert.ok(!html.includes(api.baseUrl), 'webview HTML must not expose extension.exports.baseUrl to the webview')
        assert.ok(
            !/connect-src\s+http:\/\/127\.0\.0\.1/.test(html),
            'webview CSP must not allow direct localhost HTTP bridge access',
        )
        assert.ok(
            /<script[^>]*src="\.\/assets\/index\.js"/.test(html),
            'webview HTML must reference ./assets/index.js (the built bundle)',
        )
        // Calling again is idempotent (reveal existing panel, not a new viewType).
        const panel2 = api.openWebview()
        assert.strictEqual(panel2.viewType, 'agentils')
        panel.dispose()
    })
})

async function discoverMcpHttpUrl() {
    // The extension's autoStart picks a random ephemeral port; we probe a
    // small range starting from the configured default.
    // Fast path: read the config the extension wrote on activation.
    const cfg = vscode.workspace.getConfiguration('agentils')
    const configured = cfg.get('mcp.httpUrl', 'http://127.0.0.1:8788')
    if (await probeHealth(configured)) return configured
    // Probe common ports.
    for (const port of [8788, 8789, 8790, 8791, 8792, 0]) {
        if (port === 0) continue
        const url = 'http://127.0.0.1:' + port
        if (await probeHealth(url)) return url
    }
    // Range scan as last resort.
    for (let port = 49152; port < 49200; port++) {
        const url = 'http://127.0.0.1:' + port
        if (await probeHealth(url)) return url
    }
    return null
}

async function probeHealth(baseUrl) {
    try {
        const r = await fetch(baseUrl + '/api/health', { signal: AbortSignal.timeout(300) })
        if (!r.ok) return false
        const j = await r.json()
        return j && j.ok === true && j.name === 'agentils-mcp'
    } catch {
        return false
    }
}
