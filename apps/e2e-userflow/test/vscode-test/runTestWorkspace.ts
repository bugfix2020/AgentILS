/**
 * @vscode/test-electron entrypoint for the **workspace** suite.
 *
 *   1. Spawns the real CLI:  `node packages/cli/dist/index.js init --workspace <tmp>`
 *   2. Launches a real VS Code stable build with that tmp dir as the
 *      workspace folder (`--folder-uri=file://...`) and our extension under
 *      development.
 *   3. The workspace suite (selected via AGENTILS_TEST_SUITE=workspace) then
 *      asserts that VS Code can actually see the CLI-emitted files via
 *      `vscode.workspace.findFiles` and that the extension activates and
 *      registers all four LM tools.
 *
 * Run:  npx tsx test/vscode-test/runTestWorkspace.ts
 */
import { runTests } from '@vscode/test-electron'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..')
const CLI_DIST = join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js')

async function main(): Promise<void> {
    if (!existsSync(CLI_DIST)) {
        throw new Error(`CLI dist missing: ${CLI_DIST} — run \`pnpm --filter @agent-ils/cli build\` first`)
    }
    const workspaceDir = mkdtempSync(join(tmpdir(), 'agentils-vscode-ws-'))
    process.stderr.write(`[runTestWorkspace] tmp workspace: ${workspaceDir}\n`)
    const init = spawnSync(process.execPath, [CLI_DIST, 'init', '--workspace', workspaceDir], {
        stdio: 'inherit',
        env: { ...process.env, NODE_OPTIONS: '' },
    })
    if (init.status !== 0) throw new Error(`cli init failed with code ${init.status}`)

    const extensionDevelopmentPath = join(REPO_ROOT, 'packages', 'extensions', 'agentils-vscode')
    const extensionTestsPath = join(__dirname, 'suite', 'index.cjs')
    const userDataDir = mkdtempSync(join(tmpdir(), 'agentils-vscode-userdata-ws-'))
    const statePath = join(userDataDir, 'agentils-state.json')

    process.stderr.write(`[runTestWorkspace] extensionDevelopmentPath=${extensionDevelopmentPath}\n`)
    process.stderr.write(`[runTestWorkspace] userDataDir=${userDataDir}\n`)

    const code = await runTests({
        version: 'stable',
        extensionDevelopmentPath,
        extensionTestsPath,
        extensionTestsEnv: {
            AGENTILS_TEST_SUITE: 'workspace',
            AGENTILS_TEST_STATE_PATH: statePath,
            AGENTILS_DEBUG: process.env.AGENTILS_DEBUG ?? '1',
        },
        launchArgs: [
            '--no-sandbox',
            '--disable-gpu',
            '--disable-workspace-trust',
            `--user-data-dir=${userDataDir}`,
            '--disable-extensions',
            `--folder-uri=${pathToFileURL(workspaceDir).href}`,
        ],
    })
    process.stderr.write(`[runTestWorkspace] vscode exited code=${code}\n`)
    process.exit(code)
}

main().catch((err) => {
    process.stderr.write(`[runTestWorkspace] FAILED: ${(err as Error).stack || (err as Error).message}\n`)
    process.exit(1)
})
