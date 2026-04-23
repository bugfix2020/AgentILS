import assert from 'node:assert/strict'
import test from 'node:test'
import { AgentGateOrchestrator } from '../../src/orchestrator/orchestrator.js'
import { AgentGateMemoryStore } from '../../src/store/memory-store.js'

test('awaitInteraction parks until resolveInteraction fires', async () => {
  const orchestrator = new AgentGateOrchestrator(new AgentGateMemoryStore())
  const first = orchestrator.runTaskLoop({ userIntent: 'await test' })
  const taskId = first.task.taskId
  const interactionKey = first.interaction!.interactionKey

  let resolved: unknown = null
  const waiter = orchestrator.awaitInteraction(taskId).then((r) => {
    resolved = r
    return r
  })

  // Tick the event loop — promise must NOT have resolved yet.
  await new Promise<void>((r) => setImmediate(r))
  assert.equal(resolved, null)

  const fulfilled = orchestrator.resolveInteraction(taskId, {
    interactionKey,
    actionId: 'execute',
  })
  assert.equal(fulfilled, true)

  const out = await waiter
  assert.equal(out.actionId, 'execute')
  assert.equal(out.interactionKey, interactionKey)
})

test('resolveInteraction with no waiter returns false (no throw)', () => {
  const orchestrator = new AgentGateOrchestrator(new AgentGateMemoryStore())
  const ok = orchestrator.resolveInteraction('task_missing', {
    interactionKey: 'noop',
    actionId: 'execute',
  })
  assert.equal(ok, false)
})

test('awaitInteraction respects AbortSignal', async () => {
  const orchestrator = new AgentGateOrchestrator(new AgentGateMemoryStore())
  const first = orchestrator.runTaskLoop({ userIntent: 'abort test' })
  const ctrl = new AbortController()
  const waiter = orchestrator.awaitInteraction(first.task.taskId, ctrl.signal)
  ctrl.abort()
  await assert.rejects(waiter, /aborted/)
})
