import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { AgentGateOrchestrator } from '../../src/orchestrator/orchestrator.js'
import { defaultConfig } from '../../src/config/defaults.js'
import { registerGatewayResources } from '../../src/gateway/resources.js'
import { AgentGateMemoryStore } from '../../src/store/memory-store.js'

type ResourceHandler = (...args: unknown[]) => Promise<{
  contents: Array<{ uri: string; text: string }>
}>

interface FakeResourceRuntime {
  resources: Map<string, ResourceHandler>
  store: AgentGateMemoryStore
  orchestrator: AgentGateOrchestrator
}

function createFakeResourceRuntime(): FakeResourceRuntime {
  const resources = new Map<string, ResourceHandler>()
  const store = new AgentGateMemoryStore(join(tmpdir(), `agentils-test-${randomUUID()}.json`))
  const orchestrator = new AgentGateOrchestrator(store)
  const server = {
    registerResource(name: string, _uri: unknown, _meta: unknown, handler: ResourceHandler) {
      resources.set(name, handler)
    },
  }

  registerGatewayResources({
    server: server as never,
    store,
    orchestrator,
    config: defaultConfig,
  })

  return {
    resources,
    store,
    orchestrator,
  }
}

test('conversation-resource resolves conversation state with the active snapshot runId', async () => {
  const runtime = createFakeResourceRuntime()
  const handler = runtime.resources.get('conversation-resource')
  assert.ok(handler, 'conversation-resource should be registered')

  const firstRun = runtime.orchestrator.startRun({
    title: 'Conversation A',
    goal: 'Older run should not leak into current resource',
    scope: ['src/gateway/resources.ts'],
    conversationId: 'conversation_a',
  })
  runtime.store.transitionRun(firstRun.runId, 'done', 'completed')
  runtime.store.updateRun(firstRun.runId, {
    userConfirmedDone: true,
    verifyPassed: true,
  })
  runtime.orchestrator.endConversation(firstRun.runId)

  const secondRun = runtime.orchestrator.startRun({
    title: 'Conversation B',
    goal: 'Latest run should drive current resource',
    scope: ['src/gateway/resources.ts'],
    conversationId: 'conversation_b',
  })

  const calls: Array<string | null | undefined> = []
  const originalGetConversationRecord = runtime.store.getConversationRecord.bind(runtime.store)
  runtime.store.getConversationRecord = ((preferredRunId?: string | null) => {
    calls.push(preferredRunId)
    return originalGetConversationRecord(preferredRunId)
  }) as typeof runtime.store.getConversationRecord

  const response = await handler()
  const payload = JSON.parse(response.contents[0]?.text ?? '{}')

  assert.equal(calls.at(-1), secondRun.runId)
  assert.equal(payload.conversation.conversationId, 'conversation_b')
  assert.equal(payload.activeTask.runId, secondRun.runId)
})
