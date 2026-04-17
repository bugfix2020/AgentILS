import assert from 'node:assert/strict'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { AgentGateAuditLogger } from '../../src/audit/audit-logger.js'
import { AgentGateTaskOrchestrator } from '../../src/orchestrator/task-orchestrator.js'
import { AgentGateMemoryStore } from '../../src/store/memory-store.js'
import { type StartRunInput } from '../../src/types/index.js'
import { createOverrideState } from '../../src/control/override-policy.js'

function makeOrchestrator() {
  const store = new AgentGateMemoryStore(join(tmpdir(), `agentils-test-${randomUUID()}.json`))
  const audit = new AgentGateAuditLogger(store)
  return { store, orchestrator: new AgentGateTaskOrchestrator(store, audit) }
}

test('normal mode + currentStep=execute + missingInfo non-empty → throws and reverts to confirm_elements', () => {
  const { store, orchestrator } = makeOrchestrator()

  const input: StartRunInput = {
    title: 'Gate test',
    goal: 'Test gate blocking',
    controlMode: 'normal',
  }
  const run = store.startRun(input)
  // Set approvalPassed so the approval redirect doesn't trigger
  store.updateRun(run.runId, { approvalPassed: true })
  const taskCard = store.requireTaskCard(run.runId)

  // steps is empty → technicallyReady=false in evaluateTaskReadiness
  const toExecute = {
    ...taskCard,
    currentStep: 'execute' as const,
    steps: [],
    verificationRequirements: [],
    goal: '',
    executionReadiness: {
      ...taskCard.executionReadiness,
      policyAllowed: true,
      boundaryApproved: true,
      missingInfo: ['task steps'],
    },
  }

  assert.throws(
    () => orchestrator.upsertTaskCard(toExecute),
    (err: Error) => {
      assert.ok(err.message.includes('Task execution gate blocked'))
      return true
    },
  )

  const stored = store.requireTaskCard(run.runId)
  assert.equal(stored.currentStep, 'confirm_elements')
})

test('normal mode + currentStep=execute + full info + boundaryApproved=true → allowed', () => {
  const { store, orchestrator } = makeOrchestrator()

  const input: StartRunInput = {
    title: 'Ready task',
    goal: 'Execute with all gates green',
    controlMode: 'normal',
  }
  const run = store.startRun(input)
  store.updateRun(run.runId, { approvalPassed: true })
  const taskCard = store.requireTaskCard(run.runId)

  const toExecute = {
    ...taskCard,
    currentStep: 'execute' as const,
    steps: [{ id: 's1', name: 'step 1', status: 'todo' as const }],
    verificationRequirements: ['verify something'],
    goal: 'Execute with all gates green',
    executionReadiness: {
      ...taskCard.executionReadiness,
      policyAllowed: true,
      boundaryApproved: true,
      missingInfo: [],
    },
  }

  const result = orchestrator.upsertTaskCard(toExecute)
  assert.equal(result.currentStep, 'execute')
})

test('alternate mode + currentStep=execute + missingInfo non-empty + override active → allowed', () => {
  const { store, orchestrator } = makeOrchestrator()

  const override = createOverrideState({
    taskId: 'test-task-override',
    summary: 'User accepted risks',
    acceptedRisks: [],
    level: 'soft',
    mode: 'alternate',
  })

  const input: StartRunInput = {
    title: 'Override task',
    goal: 'Execute with override',
    controlMode: 'alternate',
    overrideState: override,
  }
  const run = store.startRun(input)
  store.updateRun(run.runId, { approvalPassed: true })
  const taskCard = store.requireTaskCard(run.runId)

  // Empty steps/goal means evaluateTaskReadiness would normally say technicallyReady=false
  // but override active → technicallyReady=true
  const toExecute = {
    ...taskCard,
    currentStep: 'execute' as const,
    steps: [],
    verificationRequirements: [],
    goal: '',
    controlMode: 'alternate' as const,
    overrideState: override,
    executionReadiness: {
      ...taskCard.executionReadiness,
      policyAllowed: true,
      boundaryApproved: true,
      missingInfo: ['task steps'],
    },
  }

  const result = orchestrator.upsertTaskCard(toExecute)
  assert.equal(result.currentStep, 'execute')
})

test('direct mode + any state → gate not checked, upsert succeeds', () => {
  const { store, orchestrator } = makeOrchestrator()

  const input: StartRunInput = {
    title: 'Direct task',
    goal: 'Execute in direct mode',
    controlMode: 'direct',
  }
  const run = store.startRun(input)
  const taskCard = store.requireTaskCard(run.runId)

  // Even with all gates failing, direct mode bypasses the check
  const toExecute = {
    ...taskCard,
    currentStep: 'execute' as const,
    steps: [],
    verificationRequirements: [],
    goal: '',
    controlMode: 'direct' as const,
    executionReadiness: {
      ...taskCard.executionReadiness,
      policyAllowed: false,
      boundaryApproved: false,
      missingInfo: ['everything'],
    },
  }

  const result = orchestrator.upsertTaskCard(toExecute)
  assert.equal(result.currentStep, 'execute')
})

// --- Phase 3: Step interception tests ---

test('normal mode + plan→execute + approvalPassed=false → redirects to approval', () => {
  const { store, orchestrator } = makeOrchestrator()

  const input: StartRunInput = {
    title: 'Approval redirect',
    goal: 'Test approval interception',
    controlMode: 'normal',
  }
  const run = store.startRun(input)
  const taskCard = store.requireTaskCard(run.runId)

  assert.equal(run.approvalPassed, false)

  const toExecute = {
    ...taskCard,
    currentStep: 'execute' as const,
    steps: [{ id: 's1', name: 'step 1', status: 'todo' as const }],
    verificationRequirements: ['verify something'],
    goal: 'Test approval interception',
    executionReadiness: {
      ...taskCard.executionReadiness,
      policyAllowed: true,
      boundaryApproved: true,
    },
  }

  const result = orchestrator.upsertTaskCard(toExecute)
  assert.equal(result.currentStep, 'approval')
})

test('normal mode + plan→execute + approvalPassed=true → proceeds to execute', () => {
  const { store, orchestrator } = makeOrchestrator()

  const input: StartRunInput = {
    title: 'Approved task',
    goal: 'Execute after approval',
    controlMode: 'normal',
  }
  const run = store.startRun(input)
  store.updateRun(run.runId, { approvalPassed: true })
  const taskCard = store.requireTaskCard(run.runId)

  const toExecute = {
    ...taskCard,
    currentStep: 'execute' as const,
    steps: [{ id: 's1', name: 'step 1', status: 'todo' as const }],
    verificationRequirements: ['verify something'],
    goal: 'Execute after approval',
    executionReadiness: {
      ...taskCard.executionReadiness,
      policyAllowed: true,
      boundaryApproved: true,
    },
  }

  const result = orchestrator.upsertTaskCard(toExecute)
  assert.equal(result.currentStep, 'execute')
})

test('direct mode + plan→execute → no approval redirect', () => {
  const { store, orchestrator } = makeOrchestrator()

  const input: StartRunInput = {
    title: 'Direct no approval',
    goal: 'Skip approval in direct mode',
    controlMode: 'direct',
  }
  const run = store.startRun(input)
  const taskCard = store.requireTaskCard(run.runId)

  const toExecute = {
    ...taskCard,
    currentStep: 'execute' as const,
    steps: [],
    verificationRequirements: [],
    goal: '',
    controlMode: 'direct' as const,
    executionReadiness: {
      ...taskCard.executionReadiness,
      policyAllowed: false,
      boundaryApproved: false,
    },
  }

  const result = orchestrator.upsertTaskCard(toExecute)
  assert.equal(result.currentStep, 'execute')
})

test('execute→verify → auto handoff_prepare then verify', () => {
  const { store, orchestrator } = makeOrchestrator()

  const input: StartRunInput = {
    title: 'Handoff test',
    goal: 'Test handoff_prepare interception',
    controlMode: 'direct',
  }
  const run = store.startRun(input)
  store.patchTaskCard(run.runId, { currentStep: 'execute' })
  store.updateRun(run.runId, { currentStep: 'execute' })
  const taskCard = store.requireTaskCard(run.runId)
  assert.equal(taskCard.currentStep, 'execute')

  const toVerify = {
    ...taskCard,
    currentStep: 'verify' as const,
    controlMode: 'direct' as const,
  }

  const result = orchestrator.upsertTaskCard(toVerify)
  assert.equal(result.currentStep, 'verify')

  const handoff = store.requireHandoff(run.runId)
  assert.ok(Array.isArray(handoff.changeSummary))
  assert.ok(Array.isArray(handoff.impactScope))
  assert.ok(Array.isArray(handoff.manualCheckpoints))
})

test('handoff_prepare→verify → no interception', () => {
  const { store, orchestrator } = makeOrchestrator()

  const input: StartRunInput = {
    title: 'No re-intercept',
    goal: 'handoff_prepare to verify should pass through',
    controlMode: 'direct',
  }
  const run = store.startRun(input)
  store.patchTaskCard(run.runId, { currentStep: 'handoff_prepare' })
  store.updateRun(run.runId, { currentStep: 'handoff_prepare' })
  const taskCard = store.requireTaskCard(run.runId)

  const toVerify = {
    ...taskCard,
    currentStep: 'verify' as const,
    controlMode: 'direct' as const,
  }

  const result = orchestrator.upsertTaskCard(toVerify)
  assert.equal(result.currentStep, 'verify')
})
