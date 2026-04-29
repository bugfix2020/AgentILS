/**
 * @vscode/test-electron entrypoint — downloads (caches) a real VS Code
 * stable build, then launches it with our extension under test loaded
 * from `packages/extensions/agentils-vscode` and runs the suite from
 * `./suite/index.ts`.
 *
 * Run:  npx tsx test/vscode-test/runTest.ts
 */
import { runTests } from '@vscode/test-electron'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..')

async function main(): Promise<void> {
    const extensionDevelopmentPath = join(REPO_ROOT, 'packages', 'extensions', 'agentils-vscode')
    const extensionTestsPath = join(__dirname, 'suite', 'index.cjs') // built by tsc below
    // Each run gets its own user-data-dir so VS Code state never leaks between
    // runs and CI machines never collide.
    const userDataDir = mkdtempSync(join(tmpdir(), 'agentils-vscode-userdata-'))
    const statePath = join(userDataDir, 'agentils-state.json')

    process.stderr.write(`[runTest] extensionDevelopmentPath=${extensionDevelopmentPath}\n`)
    process.stderr.write(`[runTest] extensionTestsPath=${extensionTestsPath}\n`)
    process.stderr.write(`[runTest] userDataDir=${userDataDir}\n`)

    const code = await runTests({
        version: 'stable',
        extensionDevelopmentPath,
        extensionTestsPath,
        extensionTestsEnv: {
            // Shrink heartbeat & sweep so the timeout-branch test runs in seconds.
            AGENTILS_TEST_HEARTBEAT_MS: process.env.AGENTILS_TEST_HEARTBEAT_MS ?? '1500',
            AGENTILS_TEST_SWEEP_MS: process.env.AGENTILS_TEST_SWEEP_MS ?? '500',
            AGENTILS_TEST_STATE_PATH: statePath,
            AGENTILS_DEBUG: process.env.AGENTILS_DEBUG ?? '1',
        },
        launchArgs: [
            '--no-sandbox',
            '--disable-gpu',
            '--disable-workspace-trust',
            `--user-data-dir=${userDataDir}`,
            // Open an empty workspace
            '--disable-extensions',
            // (We allow only our extension via extensionDevelopmentPath; --disable-extensions
            //  still allows the development extension to load.)
        ],
    })
    process.stderr.write(`[runTest] vscode exited code=${code}\n`)
    process.exit(code)
}

main().catch((err) => {
    process.stderr.write(`[runTest] FAILED: ${(err as Error).stack || (err as Error).message}\n`)
    process.exit(1)
})
