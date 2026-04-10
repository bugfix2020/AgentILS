import { readFileSync } from 'node:fs'
import { STATE_FILE, parseJson } from './hook-common.mjs'

export function loadState() {
  try {
    return parseJson(readFileSync(STATE_FILE, 'utf8'), {
      meta: { lastRunId: null },
      runs: [],
      taskCards: [],
      handoffs: [],
      auditEvents: [],
      runEvents: [],
    })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return {
        meta: { lastRunId: null },
        runs: [],
        taskCards: [],
        handoffs: [],
        auditEvents: [],
        runEvents: [],
      }
    }
    throw error
  }
}

export function getRunIdFromPayload(payload) {
  const candidates = [
    payload?.runId,
    payload?.sessionId,
    payload?.toolInput?.runId,
    payload?.input?.runId,
    payload?.request?.params?.arguments?.runId,
    payload?.request?.params?.runId,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate
    }
  }

  return null
}

export function getToolNameFromPayload(payload) {
  const candidates = [
    payload?.toolName,
    payload?.tool_name,
    payload?.name,
    payload?.request?.params?.name,
    payload?.toolCall?.name,
    payload?.event?.toolName,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate
    }
  }

  return null
}

export function getTargetsFromPayload(payload) {
  const explicitTargets = payload?.targets ?? payload?.toolInput?.targets ?? payload?.input?.targets
  if (Array.isArray(explicitTargets)) {
    return explicitTargets.map((value) => String(value))
  }

  const taskCard = payload?.toolInput?.taskCard ?? payload?.input?.taskCard
  if (taskCard && typeof taskCard === 'object' && Array.isArray(taskCard.touchedFiles)) {
    return taskCard.touchedFiles.map((value) => String(value))
  }

  const handoff = payload?.toolInput?.handoff ?? payload?.input?.handoff
  if (handoff && typeof handoff === 'object' && Array.isArray(handoff.touchedFiles)) {
    return handoff.touchedFiles.map((value) => String(value))
  }

  return []
}

export function resolveRun(state, preferredRunId) {
  const runs = Array.isArray(state?.runs) ? state.runs : []
  if (preferredRunId) {
    const exact = runs.find((run) => run?.runId === preferredRunId)
    if (exact) {
      return exact
    }
  }

  const lastRunId = state?.meta?.lastRunId
  if (typeof lastRunId === 'string') {
    const latest = runs.find((run) => run?.runId === lastRunId)
    if (latest) {
      return latest
    }
  }

  return null
}

export function resolveTaskCard(state, runId) {
  const taskCards = Array.isArray(state?.taskCards) ? state.taskCards : []
  return taskCards.find((taskCard) => taskCard?.runId === runId) ?? null
}

export function resolveHandoff(state, runId) {
  const handoffs = Array.isArray(state?.handoffs) ? state.handoffs : []
  return handoffs.find((handoff) => handoff?.runId === runId) ?? null
}

export function resolveConversationState(state) {
  const conversation = state?.conversation ?? state?.conversationRecord ?? null
  if (conversation && typeof conversation === 'object') {
    return conversation
  }
  return null
}
