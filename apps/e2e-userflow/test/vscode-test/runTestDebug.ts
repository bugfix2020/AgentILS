/**
 * @vscode/test-electron entrypoint that simulates pressing F5 in the
 * AgentILS root: it runs `scripts/prepare-debug-workspace.cjs` and then
 * launches a real VS Code with `--folder-uri=file://apps/vscode-debug`.
 *
 * The suite (`debug.test.cjs`) asserts:
 *   1. Extension is active and exports baseUrl
 *   2. All 4 LM tools are registered
 *   3. The pre-init agentils.runTask.prompt.md is discoverable via findFiles
 *   4. The local-stdio mcp.json is in place (NOT the npx default)
 *   5. Invoking a tool eagerly opens the webview before the LLM blocks
 *
 * This is the closest possible automated proxy for "F5 → ready → run task".
 */
import { runTests } from '@vscode/test-electron'
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..')
const PREPARE = join(REPO_ROOT, 'scripts', 'prepare-debug-workspace.cjs')
const DEBUG_WS = join(REPO_ROOT, 'apps', 'vscode-debug')

async function main(): Promise<void> {
    process.stderr.write(`[runTestDebug] running prepare: ${PREPARE}\n`)
    const prep = spawnSync(process.execPath, [PREPARE], { stdio: 'inherit' })
    if (prep.status !== 0) throw new Error(`prepare-debug-workspace failed with code ${prep.status}`)

    const extensionDevelopmentPath = join(REPO_ROOT, 'packages', 'extensions', 'agentils-vscode')
    const extensionTestsPath = join(__dirname, 'suite', 'index.cjs')
    const userDataDir = mkdtempSync(join(tmpdir(), 'agentils-vscode-userdata-debug-'))
    const statePath = join(userDataDir, 'agentils-state.json')

    const code = await runTests({
        version: 'stable',
        extensionDevelopmentPath,
        extensionTestsPath,
        extensionTestsEnv: {
            AGENTILS_TEST_SUITE: 'debug',
            AGENTILS_TEST_STATE_PATH: statePath,
            AGENTILS_DEBUG: process.env.AGENTILS_DEBUG ?? '1',
        },
        launchArgs: [
            '--no-sandbox',
            '--disable-gpu',
            '--disable-workspace-trust',
            `--user-data-dir=${userDataDir}`,
            '--disable-extensions',
            `--folder-uri=${pathToFileURL(DEBUG_WS).href}`,
        ],
    })
    process.stderr.write(`[runTestDebug] vscode exited code=${code}\n`)
    process.exit(code)
}

main().catch((err) => {
    process.stderr.write(`[runTestDebug] FAILED: ${(err as Error).stack || (err as Error).message}\n`)
    process.exit(1)
})
