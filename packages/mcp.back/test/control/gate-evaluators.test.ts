import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateTaskReadiness, evaluateTaskExecutionGate, type TaskExecutionGateInput } from '../../src/control/gate-evaluators.js'
import { createOverrideState } from '../../src/control/override-policy.js'

function makeBaseInput(overrides: Partial<TaskExecutionGateInput> = {}): TaskExecutionGateInput {
  return {
    taskCard: {
      goal: 'Test goal',
      scope: [],
      steps: [{ id: 's1', name: 'step 1', status: 'todo' }],
      risks: [],
      verificationRequirements: ['verify something'],
      controlMode: 'normal',
      currentStep: 'plan',
      currentStatus: 'active',
    },
    policyAllowed: true,
    boundaryApproved: true,
    overrideState: null,
    controlMode: 'normal',
    ...overrides,
  }
}

test('normal mode + missingInfo non-empty + no override → technicallyReady: false', () => {
  const input = makeBaseInput({
    taskCard: {
      goal: '',
      scope: [],
      steps: [],
      risks: [],
      verificationRequirements: [],
      controlMode: 'normal',
      currentStep: 'collect',
      currentStatus: 'active',
    },
    controlMode: 'normal',
    overrideState: null,
  })

  const result = evaluateTaskReadiness(input)
  assert.equal(result.technicallyReady, false)
  assert.ok(result.missingInfo.length > 0)
})

test('alternate mode + missingInfo non-empty + overrideState.confirmed=true → technicallyReady: true', () => {
  // createOverrideState sets confirmed: true by default
  const confirmedOverride = createOverrideState({
    taskId: 'test-task-1',
    summary: 'User accepted risks',
    acceptedRisks: [],
    level: 'soft',
    mode: 'alternate',
  })

  const input = makeBaseInput({
    taskCard: {
      goal: '',
      scope: [],
      steps: [],
      risks: [],
      verificationRequirements: [],
      controlMode: 'alternate',
      currentStep: 'collect',
      currentStatus: 'active',
    },
    controlMode: 'alternate',
    overrideState: confirmedOverride,
  })

  const result = evaluateTaskReadiness(input)
  assert.equal(result.technicallyReady, true)
})

test('alternate mode + missingInfo non-empty + no override → technicallyReady: false', () => {
  const input = makeBaseInput({
    taskCard: {
      goal: '',
      scope: [],
      steps: [],
      risks: [],
      verificationRequirements: [],
      controlMode: 'alternate',
      currentStep: 'collect',
      currentStatus: 'active',
    },
    controlMode: 'alternate',
    overrideState: null,
  })

  const result = evaluateTaskReadiness(input)
  assert.equal(result.technicallyReady, false)
})

// --- Phase 2: approvalPassed gate tests ---

test('evaluateTaskExecutionGate — normal mode + approvalPassed=false → blocked', () => {
  const input = makeBaseInput({ controlMode: 'normal' })
  const gate = evaluateTaskExecutionGate({ ...input, approvalPassed: false })
  assert.equal(gate.allowed, false)
  assert.ok(gate.reasons.some((r) => r.includes('Approval')))
})

test('evaluateTaskExecutionGate — normal mode + approvalPassed=true → allowed', () => {
  const input = makeBaseInput({ controlMode: 'normal' })
  const gate = evaluateTaskExecutionGate({ ...input, approvalPassed: true })
  assert.equal(gate.allowed, true)
})

test('evaluateTaskExecutionGate — alternate mode + approvalPassed=false → blocked', () => {
  const input = makeBaseInput({ controlMode: 'alternate' })
  const gate = evaluateTaskExecutionGate({ ...input, approvalPassed: false })
  assert.equal(gate.allowed, false)
  assert.ok(gate.reasons.some((r) => r.includes('Approval')))
})

test('evaluateTaskExecutionGate — alternate mode + approvalPassed=true → allowed', () => {
  const input = makeBaseInput({ controlMode: 'alternate' })
  const gate = evaluateTaskExecutionGate({ ...input, approvalPassed: true })
  assert.equal(gate.allowed, true)
})

test('evaluateTaskExecutionGate — direct mode + approvalPassed=false → still allowed', () => {
  const input = makeBaseInput({ controlMode: 'direct' })
  const gate = evaluateTaskExecutionGate({ ...input, approvalPassed: false })
  assert.equal(gate.allowed, true)
})

test('evaluateTaskExecutionGate — direct mode + approvalPassed=true → allowed', () => {
  const input = makeBaseInput({ controlMode: 'direct' })
  const gate = evaluateTaskExecutionGate({ ...input, approvalPassed: true })
  assert.equal(gate.allowed, true)
})
