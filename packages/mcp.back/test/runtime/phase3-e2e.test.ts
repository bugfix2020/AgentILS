import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {
  ResourceUpdatedNotificationSchema,
  ElicitRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const SERVER_BUNDLE = join(REPO_ROOT, 'packages', 'mcp', 'dist', 'index.js')

function lockPathFor(workspace: string) {
  const hash = createHash('sha1').update(workspace).digest('hex').slice(0, 12)
  return join(homedir(), '.agentils', `runtime-${hash}.lock`)
}

async function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

async function waitForLock(lockPath: string, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (existsSync(lockPath)) {
      try {
        const data = JSON.parse(readFileSync(lockPath, 'utf8'))
        if (data?.url) return data
      } catch { /* keep polling */ }
    }
    await sleep(100)
  }
  throw new Error(`Lock not written within ${timeoutMs}ms: ${lockPath}`)
}

function parseToolPayload(result: any) {
  const text = result.content?.find((c: any) => c.type === 'text')?.text ?? ''
  const i = text.indexOf('\n')
  return JSON.parse(text.slice(i + 1))
}

test('phase3 e2e: extension-side runtime-client logic against real spawned MCP HTTP server', async () => {
  assert.ok(existsSync(SERVER_BUNDLE), `MCP bundle missing: ${SERVER_BUNDLE}`)

  const fakeWorkspace = mkdtempSync(join(tmpdir(), 'agentils-phase3-e2e-'))
  const lockPath = lockPathFor(fakeWorkspace)
  if (existsSync(lockPath)) rmSync(lockPath, { force: true })

  const child = spawn('node', [SERVER_BUNDLE], {
    cwd: fakeWorkspace,
    env: {
      ...process.env,
      AGENTILS_WORKSPACE: fakeWorkspace,
      AGENTILS_HTTP_PORT: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const stderrChunks: string[] = []
  child.stderr.on('data', (b) => stderrChunks.push(b.toString('utf8')))

  try {
    const lock = await waitForLock(lockPath)
    assert.ok(lock.url.startsWith('http://'), `bad lock.url: ${lock.url}`)
    assert.equal(lock.workspace, fakeWorkspace)

    // Two clients = Copilot + extension. Verify they share a single store.
    const copilot = new Client(
      { name: 'fake-copilot', version: '1.0.0' },
      { capabilities: { elicitation: { form: {} } } },
    )
    const extension = new Client(
      { name: 'fake-extension', version: '1.0.0' },
      { capabilities: { elicitation: { form: {} } } },
    )
    await copilot.connect(new StreamableHTTPClientTransport(new URL(lock.url)))
    await extension.connect(new StreamableHTTPClientTransport(new URL(lock.url)))

    // Extension subscribes to push updates.
    const updates: string[] = []
    extension.setNotificationHandler(
      ResourceUpdatedNotificationSchema,
      async (n) => { updates.push(n.params.uri); return undefined as any },
    )
    await extension.subscribeResource({ uri: 'state://current' })

    // Extension declines elicits (we only test push path, not interaction).
    extension.setRequestHandler(ElicitRequestSchema, async () => ({ action: 'decline' as const }))
    copilot.setRequestHandler(ElicitRequestSchema, async () => ({ action: 'decline' as const }))

    // Copilot drives a task.
    const runResult = parseToolPayload(
      await copilot.callTool({
        name: 'run_task_loop',
        arguments: { userIntent: 'phase3-e2e: verify shared store + push' },
      }),
    )
    assert.ok(runResult.task?.taskId, 'task should be created')

    // Extension reads the same store.
    const readBack = parseToolPayload(
      await extension.callTool({ name: 'state_get', arguments: {} }),
    )
    assert.equal(readBack.task?.taskId, runResult.task.taskId)

    // Wait briefly for the push notification.
    const pushDeadline = Date.now() + 1500
    while (updates.length === 0 && Date.now() < pushDeadline) await sleep(50)
    assert.ok(updates.length > 0, `no resource update received; stderr: ${stderrChunks.join('')}`)

    await copilot.close()
    await extension.close()
  } finally {
    child.kill('SIGTERM')
    await sleep(150)
    if (existsSync(lockPath)) rmSync(lockPath, { force: true })
    rmSync(fakeWorkspace, { recursive: true, force: true })
  }
})
