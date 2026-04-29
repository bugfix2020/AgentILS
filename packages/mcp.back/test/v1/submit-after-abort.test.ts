import assert from 'node:assert/strict'
import test from 'node:test'
import { AgentGateOrchestrator } from '../../src/orchestrator/orchestrator.js'
import { AgentGateMemoryStore } from '../../src/store/memory-store.js'

// P1 fix: 当 LLM 已 cancel（无 waiter）时，submit_interaction_result 等价语义
// 必须能让任务状态机继续推进，而不是把 user 的 webview 操作静默丢弃。
// 这里直接测试 orchestrator 行为：abort awaitInteraction → 再 runTaskLoop 推进。
test('runTaskLoop with interactionResult advances state even after awaitInteraction abort', async () => {
  const orchestrator = new AgentGateOrchestrator(new AgentGateMemoryStore())
  const first = orchestrator.runTaskLoop({ userIntent: 'abort then user resolve' })
  const taskId = first.task.taskId
  const interactionKey = first.interaction!.interactionKey
  const initialPhase = first.task.phase

  // Simulate LLM-side cancellation while parked.
  const ctrl = new AbortController()
  const parked = orchestrator.awaitInteraction(taskId, ctrl.signal)
  ctrl.abort()
  await assert.rejects(parked, /aborted/)

  // User clicks accept_risk in webview after LLM aborted.
  // submit_interaction_result fallback path: orchestrator.runTaskLoop with
  // interactionResult must drive the state machine forward (no waiter to fulfill).
  const advanced = orchestrator.runTaskLoop({
    taskId,
    interactionResult: {
      interactionKey,
      actionId: 'execute',
    },
  })

  assert.equal(advanced.task.taskId, taskId)
  // Either phase moved forward, or terminal flipped, or a new interaction kind appeared.
  // We assert at least one of these to confirm the state machine actually advanced.
  const phaseChanged = advanced.task.phase !== initialPhase
  const hasNewInteractionOrTerminal =
    advanced.interaction?.interactionKey !== interactionKey ||
    advanced.task.terminal !== 'active'
  assert.ok(
    phaseChanged || hasNewInteractionOrTerminal,
    `Expected state to advance after fallback runTaskLoop. phase=${advanced.task.phase} terminal=${advanced.task.terminal}`,
  )
})
