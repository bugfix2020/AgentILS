import {
  allow,
  getRunIdFromPayload,
  getToolNameFromPayload,
  loadState,
  logHookEvent,
  parseJson,
  readStdin,
  resolveRun,
} from './hook-common.mjs'

const payload = parseJson(await readStdin(), {})
const state = loadState()
const toolName = getToolNameFromPayload(payload)
const run = resolveRun(state, getRunIdFromPayload(payload))

logHookEvent('audit', payload, {
  runId: run?.runId ?? null,
  toolName,
})

allow({
  runId: run?.runId,
  toolName,
})
