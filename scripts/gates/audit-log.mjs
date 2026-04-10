import {
  allow,
  logHookEvent,
  parseJson,
  readStdin,
} from '../runtime/hook-common.mjs'
import {
  getRunIdFromPayload,
  getToolNameFromPayload,
  loadState,
  resolveRun,
} from '../runtime/state-reader.mjs'

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
