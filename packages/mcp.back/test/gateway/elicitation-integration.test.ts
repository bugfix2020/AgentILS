import assert from 'node:assert/strict'
import test from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { createAgentGateServer } from '../../src/gateway/server.js'

test('ui_task_start_gate uses real MCP elicitation with form mode and interactionKind', async () => {
  const runtime = createAgentGateServer()
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

  const client = new Client(
    { name: 'agentils-mcp-test-client', version: '0.1.0' },
    { capabilities: { elicitation: {} } },
  )

  const elicitationCalls: Array<Record<string, unknown>> = []

  client.setRequestHandler(ElicitRequestSchema, async (request: { params?: Record<string, unknown> }) => {
    const params = request.params ?? {}
    elicitationCalls.push(params)

    return {
      action: 'accept',
      content: {
        title: 'Welcome onboarding',
        goal: 'Guide the user through the onboarding flow',
        controlMode: 'normal',
      },
    }
  })

  await Promise.all([runtime.server.connect(serverTransport), client.connect(clientTransport)])

  try {
    const result = await client.callTool({
      name: 'ui_task_start_gate',
      arguments: {
        title: 'Draft onboarding task',
        goal: 'Draft goal',
        controlMode: 'normal',
      },
    })

    assert.equal(result.isError, false)
    assert.equal(elicitationCalls.length, 1)
    assert.equal(elicitationCalls[0]?.mode, 'form')
    assert.equal(elicitationCalls[0]?._meta?.agentilsInteractionKind, 'startTask')

    const text = result.content?.find((item) => item.type === 'text')?.text ?? ''
    assert.match(text, /UI task started/)
    assert.match(text, /Welcome onboarding/)
    assert.match(text, /Guide the user through the onboarding flow/)
  } finally {
    await Promise.allSettled([client.close(), runtime.server.close()])
  }
})
