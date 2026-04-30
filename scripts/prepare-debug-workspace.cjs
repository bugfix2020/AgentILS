#!/usr/bin/env node
/**
 * prepare-debug-workspace.cjs
 *
 * Idempotently prepares apps/vscode-debug so the user can press F5 in the
 * AgentILS root and immediately get an Extension Development Host that has:
 *
 *   1. The full set of agentils.* prompts and agents (via @agent-ils/cli init)
 *   2. A working .vscode/mcp.json that points at the LOCAL @agent-ils/mcp build
 *      (instead of the unpublished `npx -y @agent-ils/mcp`).
 *   3. A welcome README explaining what to type into Copilot Chat.
 *
 * This runs as the last step of `prepare:agentils-extensions` (preLaunchTask
 * for the AgentILS: VS Code Extension launch config).
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const REPO_ROOT = path.resolve(__dirname, '..')
const DEMO = path.join(REPO_ROOT, 'apps', 'vscode-debug')
const CLI_DIST = path.join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js')
const MCP_DIST = path.join(REPO_ROOT, 'packages', 'mcp', 'dist', 'index.js')

function log(msg) {
    process.stdout.write(`[prepare-debug-workspace] ${msg}\n`)
}

function ensureCliInit() {
    if (!fs.existsSync(CLI_DIST)) {
        throw new Error(`CLI dist missing: ${CLI_DIST} — run \`pnpm --filter @agent-ils/cli build\` first`)
    }
    if (!fs.existsSync(MCP_DIST)) {
        throw new Error(`MCP dist missing: ${MCP_DIST} — run \`pnpm --filter @agent-ils/mcp build\` first`)
    }
    // Always re-run CLI init: it's idempotent and keeps templates in sync if
    // they change in the source tree.
    log(`running CLI init into ${DEMO}`)
    const r = spawnSync(process.execPath, [CLI_DIST, 'init', '--workspace', DEMO], {
        stdio: 'inherit',
        env: { ...process.env, NODE_OPTIONS: '' },
    })
    if (r.status !== 0) throw new Error(`cli init failed with code ${r.status}`)
}

function removeGeneratedFiles(dir, prefix, suffix) {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile()) continue
        if (!entry.name.startsWith(prefix) || !entry.name.endsWith(suffix)) continue
        fs.rmSync(path.join(dir, entry.name), { force: true })
    }
}

function resetGeneratedWorkspaceAssets() {
    removeGeneratedFiles(path.join(DEMO, '.github', 'prompts'), 'agentils.', '.prompt.md')
    removeGeneratedFiles(path.join(DEMO, '.github', 'agents'), 'agentils.', '.agent.md')
}

function rewriteMcpJsonToLocalStdio() {
    // The CLI writes `npx -y @agent-ils/mcp --stdio`, which fails locally
    // because the package isn't published. We override it with a stdio entry
    // that runs the freshly-built local dist directly.
    const mcpJsonPath = path.join(DEMO, '.vscode', 'mcp.json')
    fs.mkdirSync(path.dirname(mcpJsonPath), { recursive: true })
    const config = {
        servers: {
            agentils: {
                type: 'stdio',
                command: process.execPath, // current node binary, cross-platform
                args: [MCP_DIST, '--stdio'],
            },
        },
    }
    fs.writeFileSync(mcpJsonPath, JSON.stringify(config, null, 2) + '\n')
    log(`rewrote ${mcpJsonPath} → local stdio (${MCP_DIST})`)
}

function ensureWelcomeFile() {
    const welcome = path.join(DEMO, 'WELCOME.md')
    const body = [
        '# AgentILS Extension Development Host (F5 demo workspace)',
        '',
        'You are inside the **Extension Development Host** window with `agentils-vscode`',
        'loaded from the source tree. Everything below should already be ready:',
        '',
        `- ✓ Workspace folder: \`${DEMO}\``,
        '- ✓ Extension is active — open `View → Output → AgentILS` and look for',
        '  `extension activate done`.',
        '- ✓ The in-process MCP HTTP bridge starts on an available local port and',
        '  the extension wires Copilot LM tools to that server automatically.',
        '- ✓ `.vscode/mcp.json` points at the LOCAL `@agent-ils/mcp` build (stdio).',
        '- ✓ Four LM tools are registered with `vscode.lm`:',
        '  - `agentils_request_user_clarification`',
        '  - `agentils_request_contact_user`',
        '  - `agentils_request_user_feedback`',
        '  - `agentils_request_dynamic_action`',
        '',
        '## Try a task',
        '',
        'Open Copilot Chat (left sidebar). Then either:',
        '',
        '1. Type `/` and pick `agentils.runTask`, **or**',
        '2. Reference a tool directly: `#tool:agentils.agentils-vscode/agentilsRequestUserClarification`',
        '   followed by `请帮我确认下: 你最喜欢的颜色?`',
        '',
        'Expected behaviour: the AgentILS webview opens automatically (eagerly,',
        'before the LLM blocks on the tool call); answer in the webview;',
        'Copilot Chat receives your text as the tool result.',
        '',
        '## Cancel / timeout (optional)',
        '',
        'Click the **Cancel** button in the webview while a request is open — the',
        'tool call returns a structured cancellation marker that the LLM can act on.',
        '',
        "## What's wired",
        '',
        'See [docs/USER-WALKTHROUGH.md](../../docs/USER-WALKTHROUGH.md) for the full',
        'flow including curl probes and 30 automated regression tests.',
        '',
    ].join('\n')
    fs.writeFileSync(welcome, body)
    log(`wrote ${welcome}`)
}

function main() {
    log(`repo root: ${REPO_ROOT}`)
    log(`demo workspace: ${DEMO}`)
    fs.mkdirSync(DEMO, { recursive: true })
    resetGeneratedWorkspaceAssets()
    ensureCliInit()
    rewriteMcpJsonToLocalStdio()
    ensureWelcomeFile()
    log('done — F5 will now produce a fully-ready Extension Development Host')
}

try {
    main()
} catch (err) {
    process.stderr.write(`[prepare-debug-workspace] FAILED: ${err.stack || err.message}\n`)
    process.exit(1)
}
