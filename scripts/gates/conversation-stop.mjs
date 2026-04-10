import {
  allow,
  logHookEvent,
  parseJson,
  readStdin,
} from '../runtime/hook-common.mjs'
import { getRunIdFromPayload, loadState, resolveConversationState, resolveRun } from '../runtime/state-reader.mjs'

const payload = parseJson(await readStdin(), {})
const state = loadState()
const run = resolveRun(state, getRunIdFromPayload(payload))
const conversation = resolveConversationState(state)

if (process.env.stop_hook_active === 'true') {
  allow({ reason: 'stop_hook_active' })
}

if (!conversation) {
  logHookEvent('conversation.stop.allow', payload, {
    runId: run?.runId ?? null,
    reason: 'no_conversation_state',
  })
  allow({ runId: run?.runId, reason: 'no_conversation_state' })
}

logHookEvent('conversation.stop.allow', payload, {
  runId: run?.runId ?? null,
  conversationState: conversation.state ?? null,
})

allow({
  runId: run?.runId,
  conversationState: conversation.state ?? null,
})
