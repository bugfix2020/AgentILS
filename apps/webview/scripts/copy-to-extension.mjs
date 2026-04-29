/**
 * Copy `apps/webview/dist` into `packages/extensions/agentils-vscode/webview`
 * after a build, so the VS Code extension can serve it via asWebviewUri.
 */
import { cp, mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dist = join(here, '..', 'dist')
const target = join(here, '..', '..', '..', 'packages', 'extensions', 'agentils-vscode', 'webview')

await rm(target, { recursive: true, force: true })
await mkdir(target, { recursive: true })
await cp(dist, target, { recursive: true })

// eslint-disable-next-line no-console
console.log(`✓ webview copied → ${target}`)
