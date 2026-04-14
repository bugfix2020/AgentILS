import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveConversationState } from '../../scripts/runtime/state-reader.mjs'

test('resolveConversationState honors preferredRunId and filters completed tasks to the same conversation', () => {
  const state = {
    meta: {
      lastRunId: 'run_b_active',
    },
    runs: [
      {
        runId: 'run_a_done',
        taskId: 'task_a',
        conversationId: 'conversation_a',
        currentStatus: 'completed',
      },
      {
        runId: 'run_b_active',
        taskId: 'task_b',
        conversationId: 'conversation_b',
        currentStatus: 'active',
      },
      {
        runId: 'run_b_done',
        taskId: 'task_b_done',
        conversationId: 'conversation_b',
        currentStatus: 'completed',
      },
    ],
    runEvents: [
      {
        runId: 'run_a_done',
        type: 'conversation.completed',
      },
    ],
  }

  const conversation = resolveConversationState(state, 'run_a_done')

  assert.deepEqual(conversation, {
    state: 'conversation_done',
    activeTaskId: null,
    completedTaskIds: ['task_a'],
  })
})
