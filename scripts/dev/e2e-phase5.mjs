// E2E verification of Phase 5 control inversion.
// Spawns the AgentILS MCP HTTP server, then opens TWO MCP clients:
//   - llmClient simulates the LLM: calls run_task_loop and expects it to BLOCK
//   - webviewClient simulates the extension: calls submit_interaction_result
// Verifies the parked run_task_loop resolves AFTER (not before) the submit.

import { spawn } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'

const root = new URL('../..', import.meta.url).pathname
const serverModule = join(root, 'packages/mcp/dist/index.js')
const workspace = root.replace(/\/$/, '')
const lockKey = createHash('sha1').update(workspace).digest('hex').slice(0, 12)
const lockPath = join(homedir(), '.agentils', `runtime-${lockKey}.lock`)

if (existsSync(lockPath)) {
  try { const j = JSON.parse(readFileSync(lockPath, 'utf8')); try { process.kill(j.pid, 'SIGTERM') } catch {} } catch {}
  try { unlinkSync(lockPath) } catch {}
}
await sleep(200)

console.log('[e2e] spawning mcp server')
const proc = spawn(process.execPath, [serverModule], {
  env: { ...process.env, AGENTILS_WORKSPACE: workspace },
  stdio: ['ignore', 'pipe', 'pipe'],
})
proc.stdout.on('data', (b) => process.stdout.write(`[srv] ${b}`))
proc.stderr.on('data', (b) => process.stderr.write(`[srv-err] ${b}`))

let lock = null
for (let i = 0; i < 80; i++) {
  if (existsSync(lockPath)) { lock = JSON.parse(readFileSync(lockPath, 'utf8')); break }
  await sleep(100)
}
if (!lock) { console.error('[e2e] lock never appeared'); proc.kill(); process.exit(1) }
console.log(`[e2e] mcp up at ${lock.url}`)

const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js')

async function newClient(name) {
  const t = new StreamableHTTPClientTransport(new URL(lock.url))
  const c = new Client({ name, version: '1.0.0' }, { capabilities: {} })
  await c.connect(t)
  return c
}

function parseToolText(result) {
  const t = result.content?.find((c) => c.type === 'text')?.text
  if (!t) throw new Error('no text payload')
  const i = t.indexOf('\n')
  return JSON.parse(t.slice(i + 1))
}

const llmClient = await newClient('e2e-llm')
const webviewClient = await newClient('e2e-webview')
console.log('[e2e] both clients connected')

// Step 1: LLM kicks off run_task_loop. Should park.
console.log('[e2e] LLM: calling run_task_loop')
const t0 = Date.now()
const llmCall = llmClient.callTool({
  name: 'run_task_loop',
  arguments: { userIntent: 'E2E phase 5 verification' },
})

// Step 2: wait a beat to confirm it didn't return immediately (i.e. truly parked).
await sleep(400)
let racy = false
const winner = await Promise.race([
  llmCall.then(() => { racy = true; return 'llm-finished-too-early' }),
  Promise.resolve('still-parked'),
])
if (racy) { console.error('[e2e] FAIL: run_task_loop returned before submit_interaction_result'); proc.kill(); process.exit(2) }
console.log(`[e2e] OK: run_task_loop parked after 400ms (${winner})`)

// Step 3: simulate webview by reading current state to get interactionKey.
const stateResult = await webviewClient.callTool({ name: 'state_get', arguments: {} })
const snapshot = parseToolText(stateResult)
const taskId = snapshot.task?.taskId
const interactionKey = snapshot.task?.pendingInteraction?.interactionKey
if (!taskId || !interactionKey) {
  console.error('[e2e] FAIL: snapshot missing task or pendingInteraction', JSON.stringify(snapshot, null, 2))
  proc.kill(); process.exit(3)
}
console.log(`[e2e] webview: state has task=${taskId} interactionKey=${interactionKey}`)

// Step 4: webview submits the resolution.
console.log('[e2e] webview: submitting interaction result actionId=execute')
const submitResult = await webviewClient.callTool({
  name: 'submit_interaction_result',
  arguments: { taskId, result: { interactionKey, actionId: 'execute' } },
})
const submitPayload = parseToolText(submitResult)
console.log(`[e2e] webview: submit result`, submitPayload)
if (!submitPayload.fulfilled) {
  console.error('[e2e] FAIL: submit_interaction_result did not find a waiter')
  proc.kill(); process.exit(4)
}

// Step 5: LLM call should now resolve.
const llmResult = await llmCall
const elapsed = Date.now() - t0
const llmPayload = parseToolText(llmResult)
console.log(`[e2e] LLM: run_task_loop returned after ${elapsed}ms`)
console.log(`[e2e]   status=${llmPayload.status} phase=${llmPayload.task.phase} terminal=${llmPayload.task.terminal} nextAction=${llmPayload.next.action}`)

if (elapsed < 400) {
  console.error('[e2e] FAIL: returned too fast (control inversion broken)')
  proc.kill(); process.exit(5)
}

// Validation: phase should advance from plan → execute (because actionId=execute on plan_confirm)
if (llmPayload.task.phase !== 'execute' && llmPayload.task.phase !== 'test') {
  console.error(`[e2e] WARN: phase did not advance as expected: ${llmPayload.task.phase}`)
}

console.log('[e2e] PASS: control inversion verified end-to-end')
await llmClient.close()
await webviewClient.close()
proc.kill('SIGTERM')
await sleep(200)
process.exit(0)
