import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { ResourceUpdatedNotificationSchema } from '@modelcontextprotocol/sdk/types.js'
import { startStreamableHttpServer } from '../../src/gateway/transports.js'

/**
 * Phase 4 integration test: verifies the real gateway pushes resource
 * updates over HTTP when an orchestrator state change happens.
 *
 * This is the canonical Phase 4 contract — if it passes, Webview clients
 * can subscribe and receive realtime task updates without polling.
 */
test('Phase 4 integration: gateway pushes resource updates after run_task_loop', async () => {
  const { url, close } = await startStreamableHttpServer(undefined, {
    host: '127.0.0.1',
    port: 0,
  })

  const updates: string[] = []
  const client = new Client(
    { name: 'phase4-int-client', version: '0.0.0' },
    { capabilities: {} },
  )
  client.setNotificationHandler(
    ResourceUpdatedNotificationSchema,
    async (note) => {
      updates.push(note.params.uri)
    },
  )

  const transport = new StreamableHTTPClientTransport(new URL(url))
  await client.connect(transport)

  try {
    // Subscribe to two URIs we expect the orchestrator to push to.
    await client.subscribeResource({ uri: 'state://current' })
    await client.subscribeResource({ uri: 'state://interaction/pending' })

    // Trigger a state change.
    const result = await client.callTool({
      name: 'run_task_loop',
      arguments: {
        sessionId: 'phase4-int-session',
        userIntent: 'Phase 4 integration probe',
      },
    })
    assert.notEqual(result.isError, true, 'run_task_loop should succeed')

    // Allow SSE delivery.
    await new Promise((resolve) => setTimeout(resolve, 200))

    assert.ok(
      updates.includes('state://current'),
      `expected state://current update, got ${JSON.stringify(updates)}`,
    )
    assert.ok(
      updates.includes('state://interaction/pending'),
      `expected state://interaction/pending update, got ${JSON.stringify(updates)}`,
    )

    // Read the per-task control mode resource to confirm it works too.
    // textResult prepends a label line; strip it before JSON.parse.
    const rawText = String(
      (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '',
    )
    const jsonStart = rawText.indexOf('{')
    const snapshot = JSON.parse(rawText.slice(jsonStart))
    const taskId: string | undefined = snapshot?.task?.taskId
    assert.ok(taskId, 'expected a taskId in the result')

    const cm = await client.readResource({
      uri: `state://controlMode/${taskId}`,
    })
    const cmText = cm.contents[0]?.text
    assert.equal(typeof cmText, 'string')
    const cmData = JSON.parse(String(cmText))
    assert.equal(cmData.taskId, taskId)
    assert.ok(typeof cmData.controlMode === 'string')
    assert.ok(typeof cmData.phase === 'string')
  } finally {
    await client.close()
    await transport.close()
    await close()
  }
})

test('Phase 4 integration: notify is a no-op when no subscribers exist', async () => {
  const { url, close } = await startStreamableHttpServer(undefined, {
    host: '127.0.0.1',
    port: 0,
  })

  const updates: string[] = []
  const client = new Client(
    { name: 'phase4-int-no-sub', version: '0.0.0' },
    { capabilities: {} },
  )
  client.setNotificationHandler(
    ResourceUpdatedNotificationSchema,
    async (note) => {
      updates.push(note.params.uri)
    },
  )

  const transport = new StreamableHTTPClientTransport(new URL(url))
  await client.connect(transport)

  try {
    // Trigger state change WITHOUT subscribing first.
    await client.callTool({
      name: 'run_task_loop',
      arguments: {
        sessionId: 'phase4-int-session-2',
        userIntent: 'no subscribers test',
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 150))

    assert.equal(
      updates.length,
      0,
      'expected zero notifications when no subscribers',
    )
  } finally {
    await client.close()
    await transport.close()
    await close()
  }
})
