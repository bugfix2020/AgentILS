import assert from 'node:assert/strict'
import test from 'node:test'

test('createAgentILSParticipantTools exposes only the private long-session tools', async () => {
  const { createAgentILSParticipantTools } = await import(
    '../../../../extensions/agentils-vscode/src/chat-participant-followup.ts'
  )

  const selected = createAgentILSParticipantTools()
  assert.deepEqual(
    selected.map((tool) => tool.name),
    [
      'agentils_continue_task',
      'agentils_request_clarification',
      'agentils_request_feedback',
      'agentils_request_approval',
    ],
  )
})

test('compileAgentILSSessionMessages folds system and tool history into the user-side instruction block', async () => {
  const { compileAgentILSSessionMessages } = await import(
    '../../../../extensions/agentils-vscode/src/chat-participant-followup.ts'
  )

  const messages = compileAgentILSSessionMessages(
    {
      snapshot: {
        conversation: {
          conversationId: 'conversation_default',
          state: 'active_task',
          taskIds: ['task_1'],
          activeTaskId: 'task_1',
          lastSummaryTaskId: null,
          createdAt: '2026-04-20T00:00:00.000Z',
          updatedAt: '2026-04-20T00:00:00.000Z',
        },
        activeTask: {
          taskId: 'task_1',
          runId: 'run_1',
          title: '数学问题：134的乘法',
          goal: '求解乘法并解释过程',
          controlMode: 'normal',
          phase: 'collect',
          status: 'active',
          scope: [],
          constraints: [],
          risks: [],
          openQuestions: [],
          assumptions: [],
          decisionNeededFromUser: [],
          notes: [],
          overrideState: {
            confirmed: false,
            acknowledgedAt: null,
            note: null,
          },
          summaryDocument: null,
          createdAt: '2026-04-20T00:00:00.000Z',
          updatedAt: '2026-04-20T00:00:00.000Z',
        },
        taskHistory: [],
        latestSummary: null,
        session: {
          sessionId: 'session_1',
          status: 'active',
          conversationId: 'conversation_default',
          runId: 'run_1',
          queuedUserMessageIds: ['message_user_1'],
          pendingInteraction: null,
          createdAt: '2026-04-20T00:00:00.000Z',
          updatedAt: '2026-04-20T00:00:00.000Z',
          messages: [
            {
              id: 'message_system_1',
              role: 'system',
              kind: 'status',
              content: 'task_started',
              timestamp: '2026-04-20T00:00:00.000Z',
              state: 'final',
            },
            {
              id: 'message_user_1',
              role: 'user',
              kind: 'text',
              content: '请帮我算 134 x 28',
              timestamp: '2026-04-20T00:00:01.000Z',
              state: 'pending',
            },
            {
              id: 'message_tool_1',
              role: 'tool',
              kind: 'tool_result',
              content: 'agentils_request_clarification completed',
              timestamp: '2026-04-20T00:00:02.000Z',
              state: 'final',
            },
          ],
        },
      },
      pendingInteraction: null,
      controlMode: 'normal',
      overrideActive: false,
    },
    '@agentils 请继续',
  )

  assert.equal(messages.length, 2)
  assert.match(String(messages[0]?.content?.[0]?.value ?? ''), /Initial Copilot request/)
  assert.match(String(messages[0]?.content?.[0]?.value ?? ''), /task_started/)
  assert.match(String(messages[0]?.content?.[0]?.value ?? ''), /agentils_request_clarification completed/)
  assert.match(String(messages[1]?.content?.[0]?.value ?? ''), /请帮我算 134 x 28/)
})
