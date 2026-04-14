import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import {
  acceptUiOverride,
  buildUiRuntimeSnapshot,
  startUiTask,
} from '../../src/control-plane/ui-actions.js'

function createStateFilePath() {
  return join(tmpdir(), `agentils-ui-actions-${randomUUID()}.json`)
}

test('acceptUiOverride degrades to alternate on first override and direct on repeat override', () => {
  const stateFilePath = createStateFilePath()
  const started = startUiTask({
    stateFilePath,
    title: 'UI override flow',
    goal: 'Cover override mode transitions in UI actions',
    scope: ['src/control-plane/ui-actions.ts'],
  })

  assert.equal(started.activeTask?.controlMode, 'normal')

  const firstOverride = acceptUiOverride({
    stateFilePath,
    preferredRunId: started.activeTask?.runId,
    acknowledgement: 'Need to proceed under override',
  })

  assert.equal(firstOverride.activeTask?.controlMode, 'alternate')
  assert.equal(firstOverride.activeTask?.overrideState.confirmed, true)
  assert.equal(firstOverride.activeTask?.overrideState.note, 'Need to proceed under override')

  const secondOverride = acceptUiOverride({
    stateFilePath,
    preferredRunId: started.activeTask?.runId,
    acknowledgement: 'Repeat override to escalate mode',
  })

  assert.equal(secondOverride.activeTask?.controlMode, 'direct')
  assert.equal(secondOverride.activeTask?.overrideState.confirmed, true)
  assert.equal(secondOverride.activeTask?.overrideState.note, 'Repeat override to escalate mode')
})

test('acceptUiOverride enters direct mode immediately for hard overrides', () => {
  const stateFilePath = createStateFilePath()
  const started = startUiTask({
    stateFilePath,
    title: 'UI hard override flow',
    goal: 'Hard overrides should jump to direct mode',
    scope: ['src/control-plane/ui-actions.ts'],
  })

  const hardOverride = acceptUiOverride({
    stateFilePath,
    preferredRunId: started.activeTask?.runId,
    acknowledgement: 'Trusted environment hard override',
    level: 'hard',
  })

  assert.equal(hardOverride.activeTask?.controlMode, 'direct')
  assert.equal(hardOverride.activeTask?.overrideState.confirmed, true)
  assert.equal(hardOverride.activeTask?.overrideState.note, 'Trusted environment hard override')
})

test('buildUiRuntimeSnapshot uses conversation surface timestamps instead of store meta timestamps', () => {
  const stateFilePath = createStateFilePath()
  const started = startUiTask({
    stateFilePath,
    title: 'UI conversation timestamps',
    goal: 'Ensure UI snapshot reflects conversation projection timestamps',
    scope: ['src/control-plane/ui-actions.ts'],
  })

  const snapshot = buildUiRuntimeSnapshot({
    stateFilePath,
    preferredRunId: started.activeTask?.runId,
  })

  assert.equal(snapshot.activeTask?.createdAt, snapshot.conversation.createdAt)
  assert.ok(snapshot.conversation.updatedAt)
})
