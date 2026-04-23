import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { loadPersistentStore } from '../../src/store/persistence.js'
import { createHandoffPacket, createRunRecord, createTaskCard } from '../../src/types/index.js'

test('loadPersistentStore no longer repairs legacy mode fields', () => {
  const filePath = join(tmpdir(), `agentils-persistence-${randomUUID()}.json`)
  const taskCard = createTaskCard(
    {
      title: 'Legacy state',
      goal: 'Old mode fields should no longer be auto-repaired',
      scope: ['src/store/persistence/json-store.ts'],
      conversationId: 'conversation_legacy',
    },
    'run_legacy',
    'task_legacy',
  )
  const run = createRunRecord(taskCard, {
    title: taskCard.title,
    goal: taskCard.goal,
    scope: taskCard.scope,
    conversationId: taskCard.conversationId,
  })
  const handoff = createHandoffPacket(taskCard)

  writeFileSync(
    filePath,
    JSON.stringify(
      {
        meta: {
          lastRunId: run.runId,
          updatedAt: '2026-04-14T00:00:00.000Z',
        },
        runs: [
          {
            ...run,
            currentMode: 'direct',
            controlMode: undefined,
          },
        ],
        taskCards: [
          {
            ...taskCard,
            currentMode: 'direct',
            controlMode: undefined,
          },
        ],
        handoffs: [handoff],
        auditEvents: [],
        runEvents: [],
      },
      null,
      2,
    ),
    'utf8',
  )

  assert.throws(() => loadPersistentStore(filePath))
})
