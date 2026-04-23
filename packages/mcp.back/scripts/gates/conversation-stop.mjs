import {
  allow,
  block,
  logHookEvent,
  parseJson,
  readStdin,
} from '../runtime/hook-common.mjs'
import { getRunIdFromPayload, loadState, resolveConversationState, resolveRun } from '../runtime/state-reader.mjs'

const payload = parseJson(await readStdin(), {})
const state = loadState()
const preferredRunId = getRunIdFromPayload(payload)
const run = resolveRun(state, preferredRunId)
const conversation = resolveConversationState(state, preferredRunId)
const explicitConversationEnd = Boolean(
  payload?.explicitConversationEnd ??
    payload?.endConversation ??
    payload?.conversationEndRequested ??
    payload?.toolInput?.explicitConversationEnd ??
    payload?.input?.explicitConversationEnd,
)

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

if (conversation.state === 'active_task') {
  block('Current task is still active. Finish or cancel the task before ending the conversation.', {
    runId: run?.runId ?? null,
    conversationState: conversation.state,
  })
}

if (!explicitConversationEnd) {
  block('Conversation end was not explicitly requested.', {
    runId: run?.runId ?? null,
    conversationState: conversation.state ?? null,
  })
}

logHookEvent('conversation.stop.allow', payload, {
  runId: run?.runId ?? null,
  conversationState: conversation.state ?? null,
  explicitConversationEnd,
})

allow({
  runId: run?.runId,
  conversationState: conversation.state ?? null,
  explicitConversationEnd,
})
