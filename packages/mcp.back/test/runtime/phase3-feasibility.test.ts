/**
 * Phase 3 feasibility probe: prove that the streamable HTTP transport supports
 * server→client ElicitRequest, which is the linchpin of the elicitation bridge
 * design. If this passes, the extension can connect to the shared MCP server
 * over HTTP and act purely as a Webview UI + elicitation handler.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startStreamableHttpServer } from '../../src/gateway/transports.js'
import { acquireRuntimeLock } from '../../src/runtime/lock.js'

test('HTTP transport supports server→client ElicitRequest (Phase 3 bridge feasibility)', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'agentils-elicit-http-'))
  process.env.AGENTILS_WORKSPACE = workspace
  const lock = await acquireRuntimeLock({ workspace })
  assert.equal(lock.isOwner, true)

  const runtime = await startStreamableHttpServer(undefined, {
    host: lock.info.host,
    port: lock.info.port,
    endpoint: lock.info.endpoint,
  })

  const transport = new StreamableHTTPClientTransport(new URL(runtime.url))
  const client = new Client(
    { name: 'agentils-bridge-probe', version: '0.0.0' },
    { capabilities: { elicitation: { form: {} } } },
  )

  const elicitationCalls: Array<Record<string, unknown>> = []
  client.setRequestHandler(ElicitRequestSchema, async (request: { params?: Record<string, unknown> }) => {
    elicitationCalls.push(request.params ?? {})
    return {
      action: 'accept',
      content: { answer: 'bridge probe answer' },
    }
  })

  try {
    await client.connect(transport)

    const result = (await client.callTool({
      name: 'request_user_clarification',
      arguments: {
        question: 'Phase 3 probe: does HTTP support server→client ElicitRequest?',
        context: 'feasibility test',
        required: true,
      },
    })) as { isError?: boolean; content?: Array<{ type: string; text?: string }> }

    assert.notEqual(result.isError, true, 'tool call should succeed')
    assert.equal(elicitationCalls.length, 1, 'exactly one elicitation roundtrip should occur')
    const text = result.content?.find((item) => item.type === 'text')?.text ?? ''
    assert.match(text, /accept/i)
    assert.match(text, /bridge probe answer/)
  } finally {
    await Promise.allSettled([client.close(), runtime.close()])
    lock.release()
    delete process.env.AGENTILS_WORKSPACE
  }
})

test('HTTP transport supports two simultaneous clients sharing the same store (Phase 3 single-source feasibility)', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'agentils-multi-client-'))
  process.env.AGENTILS_WORKSPACE = workspace
  const lock = await acquireRuntimeLock({ workspace })
  assert.equal(lock.isOwner, true)

  const runtime = await startStreamableHttpServer(undefined, {
    host: lock.info.host,
    port: lock.info.port,
    endpoint: lock.info.endpoint,
  })

  // "Copilot" client — drives the loop.
  const copilotTransport = new StreamableHTTPClientTransport(new URL(runtime.url))
  const copilot = new Client(
    { name: 'fake-copilot', version: '0.0.0' },
    { capabilities: { elicitation: { form: {} } } },
  )
  // Provide a benign elicitation handler so any plan-confirm interaction can
  // resolve without Webview involvement (we are not testing elicitation here).
  copilot.setRequestHandler(ElicitRequestSchema, async () => ({ action: 'decline' }))

  // "Extension" client — observes state.
  const extTransport = new StreamableHTTPClientTransport(new URL(runtime.url))
  const ext = new Client(
    { name: 'fake-ext-bridge', version: '0.0.0' },
    { capabilities: {} },
  )

  try {
    await Promise.all([copilot.connect(copilotTransport), ext.connect(extTransport)])

    // Copilot creates a task via run_task_loop.
    const loopResult = (await copilot.callTool({
      name: 'run_task_loop',
      arguments: { userIntent: 'multi-client probe task' },
    })) as { isError?: boolean; content?: Array<{ type: string; text?: string }> }
    assert.notEqual(loopResult.isError, true)

    // Extension reads the same state via state_get.
    const stateResult = (await ext.callTool({
      name: 'state_get',
      arguments: {},
    })) as { isError?: boolean; content?: Array<{ type: string; text?: string }> }
    assert.notEqual(stateResult.isError, true)
    const stateText = stateResult.content?.find((i) => i.type === 'text')?.text ?? ''
    assert.match(stateText, /multi-client probe task/, 'extension client must observe the task created by copilot client (single source of truth)')
  } finally {
    await Promise.allSettled([copilot.close(), ext.close(), runtime.close()])
    lock.release()
    delete process.env.AGENTILS_WORKSPACE
  }
})
