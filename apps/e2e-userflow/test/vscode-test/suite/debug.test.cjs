/**
 * Real-extension-host **F5 readiness** test.
 *
 * Simulates the developer's F5 workflow defined in `.vscode/launch.json`:
 *   preLaunchTask → prepare:agentils-extensions  (build + cli init + mcp.json)
 *   then          → Extension Development Host    (--folder-uri=apps/vscode-debug)
 *
 * After F5 the user must be able to "just run a task" — these tests prove
 * the workspace is genuinely in that ready state.
 */
'use strict'

const assert = require('assert')
const vscode = require('vscode')
const path = require('path')
const fs = require('fs')

const TOOL_NAMES = [
    'agentils_request_user_clarification',
    'agentils_request_contact_user',
    'agentils_request_user_feedback',
    'agentils_request_dynamic_action',
]

function getApi() {
    const ext = vscode.extensions.getExtension('agentils.agentils-vscode')
    return (ext && ext.exports) || module.exports.__api
}

suite('F5 readiness — apps/vscode-debug as workspace', () => {
    suiteSetup(async function () {
        this.timeout(60000)
        const ext = vscode.extensions.getExtension('agentils.agentils-vscode')
        assert.ok(ext, 'extension must be available')
        const api = ext.isActive ? ext.exports : await ext.activate()
        module.exports.__api = api
        // Wait for tools to register.
        const deadline = Date.now() + 30000
        while (Date.now() < deadline) {
            const names = (vscode.lm.tools || []).map((t) => t.name)
            if (TOOL_NAMES.every((n) => names.includes(n))) return
            await new Promise((r) => setTimeout(r, 200))
        }
        throw new Error('LM tools never registered')
    })

    test('1) workspaceFolders points at apps/vscode-debug', () => {
        const folders = vscode.workspace.workspaceFolders
        assert.ok(folders && folders.length === 1)
        assert.ok(
            /vscode-debug$/.test(folders[0].uri.fsPath),
            `expected apps/vscode-debug, got ${folders[0].uri.fsPath}`,
        )
    })

    test('2) extension exports a usable baseUrl + 4 tool names', () => {
        const api = getApi()
        assert.ok(
            api && typeof api.baseUrl === 'string' && api.baseUrl.startsWith('http://'),
            'extension must export baseUrl',
        )
        assert.deepEqual(api.toolNames.sort(), [...TOOL_NAMES].sort())
    })

    test('3) Copilot-Chat-equivalent tool round-trip works without any user prep', async function () {
        this.timeout(15000)
        const api = getApi()
        const baseUrl = api.baseUrl
        const reply = 'F5-ready-' + Date.now()
        const submitting = (async () => {
            const deadline = Date.now() + 12000
            while (Date.now() < deadline) {
                const r = await fetch(baseUrl + '/api/requests/pending')
                const j = await r.json()
                if (j.requests && j.requests.length > 0) {
                    await fetch(baseUrl + '/api/requests/' + j.requests[0].id + '/submit', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ text: reply }),
                    })
                    return
                }
                await new Promise((r2) => setTimeout(r2, 80))
            }
            throw new Error('no pending request appeared')
        })()
        const result = await vscode.lm.invokeTool('agentils_request_user_clarification', {
            input: { question: 'F5 readiness probe' },
            toolInvocationToken: undefined,
        })
        await submitting
        const text = (result.content || [])
            .map((p) => (typeof p.value === 'string' ? p.value : p.text || ''))
            .filter(Boolean)
            .join('')
        assert.strictEqual(text, reply, 'tool result must round-trip user-submitted text')
    })

    test('4) all CLI-installed prompt templates are discoverable via findFiles', async function () {
        this.timeout(10000)
        const prompts = await vscode.workspace.findFiles('.github/prompts/*.prompt.md')
        assert.ok(prompts.length >= 7, `expected ≥7 prompts in apps/vscode-debug, got ${prompts.length}`)
        const names = prompts.map((u) => path.basename(u.fsPath))
        assert.ok(
            names.includes('agentils.runTask.prompt.md'),
            'agentils.runTask.prompt.md must be present (this is the user-facing /runTask)',
        )
    })

    test('5) .vscode/mcp.json points at LOCAL stdio build (not the unpublished npx)', async () => {
        const fsPath = vscode.workspace.workspaceFolders[0].uri.fsPath
        const mcpJson = JSON.parse(fs.readFileSync(path.join(fsPath, '.vscode', 'mcp.json'), 'utf8'))
        assert.equal(mcpJson.servers.agentils.type, 'stdio')
        // Must NOT be the unpublished npx default.
        assert.notEqual(
            mcpJson.servers.agentils.command,
            'npx',
            'mcp.json must be rewritten to local node + dist/index.js by prepare-debug-workspace',
        )
        assert.ok(
            mcpJson.servers.agentils.args.some((a) => /packages[\\/]+mcp[\\/]+dist[\\/]+index\.js$/.test(a)),
            'mcp.json args must reference the local mcp dist; got: ' + JSON.stringify(mcpJson.servers.agentils.args),
        )
    })

    test('6) WELCOME.md exists so the user knows what to do after F5', () => {
        const fsPath = vscode.workspace.workspaceFolders[0].uri.fsPath
        assert.ok(
            fs.existsSync(path.join(fsPath, 'WELCOME.md')),
            'apps/vscode-debug/WELCOME.md must be present (created by prepare-debug-workspace)',
        )
    })

    test('7) invoking a tool eagerly opens the webview (so the user sees the prompt while we park)', async function () {
        this.timeout(15000)
        const api = getApi()
        const baseUrl = api.baseUrl
        // Start invocation; do NOT submit yet — we want to observe the webview was
        // opened DURING the park, before any user action.
        const submittingLater = (async () => {
            // Give the invoke ~300ms to enter the park + ensurePanel path.
            await new Promise((r) => setTimeout(r, 400))
            const r = await fetch(baseUrl + '/api/requests/pending')
            const j = await r.json()
            if (!j.requests || j.requests.length === 0) throw new Error('no pending request')
            await fetch(baseUrl + '/api/requests/' + j.requests[0].id + '/submit', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ text: 'late-' + Date.now() }),
            })
        })()
        const invoking = vscode.lm.invokeTool('agentils_request_user_clarification', {
            input: { question: 'eager-webview-probe' },
            toolInvocationToken: undefined,
        })
        // Wait briefly then check ring-buffer logs for the webview-create line.
        await new Promise((r) => setTimeout(r, 200))
        const logs = api.recentLogs().join('\n')
        assert.ok(
            /\[AgentILS:webview\].*webview (create panel|reveal existing panel)/.test(logs),
            'webview manager must have been called during invoke (eagerly); recent logs tail:\n' +
                api.recentLogs().slice(-10).join('\n'),
        )
        await submittingLater
        await invoking
    })
})
