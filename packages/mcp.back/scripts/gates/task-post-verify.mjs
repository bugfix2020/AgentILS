import {
  allow,
  block,
  logHookEvent,
  parseJson,
  readStdin,
} from '../runtime/hook-common.mjs'
import {
  getRunIdFromPayload,
  getTargetsFromPayload,
  getToolNameFromPayload,
  loadState,
  resolveRun,
  resolveTaskCard,
} from '../runtime/state-reader.mjs'

const payload = parseJson(await readStdin(), {})
const state = loadState()
const run = resolveRun(state, getRunIdFromPayload(payload))
const toolName = getToolNameFromPayload(payload)
const targets = getTargetsFromPayload(payload)

if (!run) {
  allow()
}

if (run.currentStatus === 'budget_exceeded') {
  block('Run budget is exceeded. Do not continue execution until the budget is reset or scope is reduced.', {
    runId: run.runId,
    toolName,
  })
}

const taskCard = resolveTaskCard(state, run.runId)
const writeLikeTool = /(write|edit|patch|create|delete|remove|move|rename)/i.test(toolName ?? '')

if (!writeLikeTool) {
  logHookEvent('verify.allow', payload, { runId: run.runId, toolName, reason: 'non_write_tool' })
  allow({ runId: run.runId, toolName })
}

if (!taskCard) {
  block('Write-like tool calls require a persisted taskCard before execution can proceed.', {
    runId: run.runId,
    toolName,
  })
}

if (targets.length > 0 && (!Array.isArray(taskCard.touchedFiles) || taskCard.touchedFiles.length === 0)) {
  block('TaskCard.touchedFiles must be updated for write-like actions before the run can continue.', {
    runId: run.runId,
    toolName,
    details: { targets },
  })
}

if (!Array.isArray(taskCard.steps) || taskCard.steps.length === 0) {
  block('TaskCard.steps must contain at least one explicit step before write-like actions continue.', {
    runId: run.runId,
    toolName,
  })
}

logHookEvent('verify.allow', payload, { runId: run.runId, toolName, targets })
allow({ runId: run.runId, toolName })
