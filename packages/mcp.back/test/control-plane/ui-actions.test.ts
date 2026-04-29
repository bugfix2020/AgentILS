import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import {
  acceptUiOverride,
  buildUiActionServices,
  buildUiRuntimeSnapshot,
  startUiTask,
} from '../../src/control-plane/ui-actions.js'
import { AgentGateOrchestrator } from '../../src/orchestrator/orchestrator.js'
import { AgentGateMemoryStore } from '../../src/store/memory-store.js'

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

test('acceptUiOverride records traceful run and audit events', () => {
  const stateFilePath = createStateFilePath()
  const store = new AgentGateMemoryStore(stateFilePath)
  const orchestrator = new AgentGateOrchestrator(store)
  const services = buildUiActionServices(store, orchestrator)
  const started = startUiTask({
    stateFilePath,
    title: 'UI override trace',
    goal: 'Ensure UI override writes request-scoped trace metadata',
    scope: ['src/control-plane/ui-actions.ts'],
  }, services)

  const runId = started.activeTask?.runId
  assert.ok(runId)

  acceptUiOverride({
    stateFilePath,
    preferredRunId: runId,
    acknowledgement: 'Override with audit trace',
  }, services)

  const runEvents = store.listRunEvents(runId)
  const auditEvents = store.listAuditEvents(runId)
  const overrideRunEvent = runEvents.find(
    (event) => event.type === 'run.updated' && event.detail.reason === 'ui.override.accepted',
  )
  const overrideAuditEvent = auditEvents.find((event) => event.action === 'ui.override.accepted')

  assert.ok(overrideRunEvent)
  assert.equal(typeof overrideRunEvent.detail.traceId, 'string')
  assert.ok(String(overrideRunEvent.detail.traceId).startsWith('ui_action_override_'))

  assert.ok(overrideAuditEvent)
  assert.equal(typeof overrideAuditEvent.details?.traceId, 'string')
  assert.ok(String(overrideAuditEvent.details?.traceId).startsWith('ui_action_override_'))
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
