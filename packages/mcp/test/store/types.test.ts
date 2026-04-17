import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createHandoffPacket,
  createRunRecord,
  createTaskCard,
  type StartRunInput,
} from '../../src/types/index.js'

const baseInput: StartRunInput = {
  title: 'Type test',
  goal: 'Verify new fields',
  controlMode: 'normal',
}

test('createHandoffPacket includes changeSummary, impactScope, manualCheckpoints as empty arrays', () => {
  const taskCard = createTaskCard(baseInput, 'run_test_1')
  const handoff = createHandoffPacket(taskCard)

  assert.deepEqual(handoff.changeSummary, [])
  assert.deepEqual(handoff.impactScope, [])
  assert.deepEqual(handoff.manualCheckpoints, [])
})

test('createRunRecord includes approvalPassed: false', () => {
  const taskCard = createTaskCard(baseInput, 'run_test_2')
  const run = createRunRecord(taskCard, baseInput)

  assert.equal(run.approvalPassed, false)
})
