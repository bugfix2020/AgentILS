/**
 * Real-extension-host **workspace** test.
 *
 * Proves that after `agentils init --workspace <tmp>` the resulting workspace
 * is genuinely usable by VS Code:
 *
 *   1. `vscode.workspace.workspaceFolders[0]` points to the prepared tmp dir
 *   2. `vscode.workspace.findFiles('.github/prompts/*.prompt.md')` finds the
 *      full template set (proves the indexer + glob matcher accept the files)
 *   3. The injected `.vscode/mcp.json` is well-formed JSON exposing the
 *      `agentils` stdio server (proves the file is loaded by VS Code's MCP
 *      reader; we don't actually start the npx server in this test).
 */
'use strict'

const assert = require('assert')
const vscode = require('vscode')
const fs = require('fs')
const path = require('path')

suite('AgentILS workspace — real VS Code host', () => {
    test('workspaceFolders points at the CLI-prepared tmp dir', () => {
        const folders = vscode.workspace.workspaceFolders
        assert.ok(folders && folders.length === 1, 'expected exactly one workspace folder')
        const fsPath = folders[0].uri.fsPath
        assert.ok(/agentils-vscode-ws-/.test(fsPath), `workspace path looks wrong: ${fsPath}`)
        assert.ok(fs.existsSync(path.join(fsPath, '.vscode', 'mcp.json')), 'mcp.json must exist')
    })

    test('findFiles discovers the full prompt template set', async function () {
        this.timeout(15000)
        // Wait briefly for the file watcher / indexer to settle on cold start.
        let prompts = []
        const deadline = Date.now() + 10000
        while (Date.now() < deadline) {
            prompts = await vscode.workspace.findFiles('.github/prompts/*.prompt.md')
            if (prompts.length >= 7) break
            await new Promise((r) => setTimeout(r, 200))
        }
        assert.ok(
            prompts.length >= 7,
            `expected ≥7 prompt files via findFiles, got ${prompts.length}: ${prompts.map((u) => u.fsPath).join(', ')}`,
        )
        const names = prompts.map((u) => path.basename(u.fsPath))
        assert.ok(names.includes('agentils.runTask.prompt.md'), 'agentils.runTask.prompt.md must be discoverable')
    })

    test('findFiles discovers the agent template set', async function () {
        this.timeout(15000)
        let agents = []
        const deadline = Date.now() + 10000
        while (Date.now() < deadline) {
            agents = await vscode.workspace.findFiles('.github/agents/*.agent.md')
            if (agents.length >= 10) break
            await new Promise((r) => setTimeout(r, 200))
        }
        assert.ok(agents.length >= 10, `expected ≥10 agent files via findFiles, got ${agents.length}`)
    })

    test('.vscode/mcp.json is well-formed and exposes agentils stdio server', async () => {
        const fsPath = vscode.workspace.workspaceFolders[0].uri.fsPath
        const mcpUri = vscode.Uri.file(path.join(fsPath, '.vscode', 'mcp.json'))
        const bytes = await vscode.workspace.fs.readFile(mcpUri)
        const json = JSON.parse(Buffer.from(bytes).toString('utf8'))
        assert.ok(json.servers, 'mcp.json must contain `servers`')
        assert.ok(json.servers.agentils, 'mcp.json must contain `servers.agentils`')
        assert.equal(json.servers.agentils.type, 'stdio')
        assert.equal(json.servers.agentils.command, 'npx')
        assert.deepEqual(json.servers.agentils.args, ['-y', '@agentils/mcp', '--stdio'])
    })

    test('extension still activates inside this workspace and registers all 4 LM tools', async function () {
        this.timeout(20000)
        const ext = vscode.extensions.getExtension('agentils.agentils-vscode')
        assert.ok(ext, 'extension must be available in workspace mode')
        if (!ext.isActive) await ext.activate()
        const expected = [
            'agentils_request_user_clarification',
            'agentils_request_contact_user',
            'agentils_request_user_feedback',
            'agentils_request_dynamic_action',
        ]
        const deadline = Date.now() + 10000
        while (Date.now() < deadline) {
            const names = (vscode.lm.tools || []).map((t) => t.name)
            if (expected.every((n) => names.includes(n))) return
            await new Promise((r) => setTimeout(r, 200))
        }
        const names = (vscode.lm.tools || []).map((t) => t.name)
        throw new Error('tools not registered in workspace mode; saw: ' + JSON.stringify(names))
    })
})
