import {
  allow,
  block,
  getRunIdFromPayload,
  loadState,
  logHookEvent,
  parseJson,
  readStdin,
  resolveRun,
} from './hook-common.mjs'

const payload = parseJson(await readStdin(), {})
const state = loadState()
const run = resolveRun(state, getRunIdFromPayload(payload))

if (process.env.stop_hook_active === 'true') {
  allow({ reason: 'stop_hook_active' })
}

if (!run) {
  allow({ reason: 'no_active_run' })
}

if (run.currentStatus === 'budget_exceeded') {
  allow({ runId: run.runId, reason: 'budget_exceeded' })
}

if (!run.userConfirmedDone) {
  block('User has not confirmed completion. Continue by calling feedback_gate or revising the result.', {
    runId: run.runId,
  })
}

if (!run.verifyPassed) {
  block('Verification has not passed yet. Call verify_run before finishing.', {
    runId: run.runId,
  })
}

logHookEvent('stop.allow', payload, { runId: run.runId })
allow({ runId: run.runId })
