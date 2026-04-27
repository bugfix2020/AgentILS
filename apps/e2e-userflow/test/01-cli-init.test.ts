/**
 * E2E user-flow test #1 — real `agentils init --workspace` flow.
 *
 * Verifies the user-visible side-effects exactly as a developer running
 *   `npx @agentils/cli init --workspace .`
 * would observe them:
 *   1. CLI exit code 0
 *   2. .vscode/mcp.json is created with `servers.agentils` (stdio + npx)
 *   3. The renamed `agentils.runTask.prompt.md` exists in .github/prompts
 *      (this is the `runcode` analogue mentioned in the user request)
 *   4. The complete renamed template set landed (no `hc.*` / `humanClarification.*`
 *      identifiers leak into the workspace)
 *   5. Re-running init is idempotent (no crash, files re-written)
 */
import { strict as assert } from 'node:assert'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { CLI_DIST } from './helpers/paths.js'

function runCli(workspace: string): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolveP) => {
        const child = spawn(process.execPath, [CLI_DIST, 'init', '--workspace', workspace], {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, NODE_OPTIONS: '' },
        })
        let stdout = ''
        let stderr = ''
        child.stdout.on('data', (d) => (stdout += d.toString()))
        child.stderr.on('data', (d) => (stderr += d.toString()))
        child.on('close', (code) => resolveP({ code: code ?? -1, stdout, stderr }))
    })
}

test('user-flow: agentils init --workspace produces a usable VS Code workspace', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'agentils-userflow-init-'))
    try {
        const r = await runCli(tmp)
        assert.equal(r.code, 0, `cli must exit 0, got ${r.code}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
        assert.match(r.stdout, /AgentILS installed \(workspace\)/, 'cli must print install summary')

        // 1) .vscode/mcp.json contains the agentils stdio entry
        const mcpJson = JSON.parse(await readFile(join(tmp, '.vscode', 'mcp.json'), 'utf8'))
        assert.ok(mcpJson.servers?.agentils, 'mcp.json must declare servers.agentils')
        assert.equal(mcpJson.servers.agentils.type, 'stdio')
        assert.equal(mcpJson.servers.agentils.command, 'npx')
        assert.deepEqual(mcpJson.servers.agentils.args, ['-y', '@agentils/mcp', '--stdio'])

        // 2) the runTask prompt (the `runcode` analogue) is present
        const promptPath = join(tmp, '.github', 'prompts', 'agentils.runTask.prompt.md')
        const promptBody = await readFile(promptPath, 'utf8')
        assert.ok(promptBody.length > 0, 'agentils.runTask.prompt.md must be non-empty')

        // 3) full renamed template set landed
        const promptsDir = await readdir(join(tmp, '.github', 'prompts'))
        const agentsDir = await readdir(join(tmp, '.github', 'agents'))
        const all = [...promptsDir, ...agentsDir]
        assert.ok(promptsDir.length >= 7, `expected ≥7 prompts, got ${promptsDir.length}`)
        assert.ok(agentsDir.length >= 10, `expected ≥10 agents, got ${agentsDir.length}`)
        for (const f of all) {
            assert.ok(
                f.startsWith('agentils.') || f.startsWith('continue.') || f.startsWith('done.'),
                `file ${f} must be in the agentils namespace`,
            )
            assert.ok(!/^hc\./.test(f), `legacy hc.* file leaked: ${f}`)
        }

        // 4) deep content scan — no humanClarification.* / hc.* command identifiers
        for (const f of all) {
            const dir = promptsDir.includes(f) ? '.github/prompts' : '.github/agents'
            const body = await readFile(join(tmp, dir, f), 'utf8')
            assert.ok(!/humanClarification\./.test(body), `${f} contains legacy humanClarification.* identifier`)
            // hc. leaks: the templates rename hc.* → agentils.*; only allow inside code-fence prose
            const offending = body.match(/\bhc\.[a-zA-Z]+/g)
            assert.equal(offending, null, `${f} still references legacy hc.* identifier(s): ${offending?.join(', ')}`)
        }

        // 5) idempotent re-run
        const r2 = await runCli(tmp)
        assert.equal(r2.code, 0, 'second init must also exit 0')
    } finally {
        await rm(tmp, { recursive: true, force: true })
    }
})
