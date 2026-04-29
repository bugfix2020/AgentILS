import assert from 'node:assert/strict'
import test from 'node:test'
import { AgentGateOrchestrator } from '../../src/orchestrator/orchestrator.js'
import { AgentGateMemoryStore } from '../../src/store/memory-store.js'

test('run_task_loop creates a task and moves into plan with a pending interaction', () => {
  const orchestrator = new AgentGateOrchestrator(new AgentGateMemoryStore())

  const result = orchestrator.runTaskLoop({
    userIntent: '实现新的 runTask 工作流',
  })

  assert.equal(result.status, 'continue')
  assert.equal(result.task.phase, 'plan')
  assert.equal(result.task.terminal, 'active')
  assert.equal(result.interaction?.kind, 'plan_confirm')
  assert.equal(result.next.canRenderWebview, true)
  assert.equal(result.snapshot.task?.controlMode, 'normal')
})

test('/exitConversation abandons the active task and stops the loop', () => {
  const orchestrator = new AgentGateOrchestrator(new AgentGateMemoryStore())
  const first = orchestrator.runTaskLoop({
    userIntent: '实现新的 runTask 工作流',
  })

  const exited = orchestrator.runTaskLoop({
    taskId: first.task.taskId,
    userIntent: '/exitConversation',
  })

  assert.equal(exited.status, 'abandoned')
  assert.equal(exited.task.terminal, 'abandoned')
  assert.equal(exited.snapshot.session.status, 'closed')
})

test('closing the webview reopens the same interaction and keeps the task active', () => {
  const orchestrator = new AgentGateOrchestrator(new AgentGateMemoryStore())
  const first = orchestrator.runTaskLoop({
    userIntent: '实现新的 runTask 工作流',
  })

  const reopened = orchestrator.runTaskLoop({
    taskId: first.task.taskId,
    interactionResult: {
      interactionKey: first.interaction!.interactionKey,
      closed: true,
    },
  })

  assert.equal(reopened.status, 'continue')
  assert.equal(reopened.task.terminal, 'active')
  assert.equal(reopened.interaction?.kind, 'plan_confirm')
  assert.equal(reopened.interaction?.reopenCount, 1)
})
