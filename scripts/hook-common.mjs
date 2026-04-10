import { appendFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const STATE_FILE = resolve(process.env.AGENTILS_STATE_FILE ?? '.data/agentils-state.json')
const HOOK_AUDIT_FILE = resolve(process.env.AGENTILS_HOOK_AUDIT_FILE ?? '.data/agentils-hook-audit.log')

export async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8').trim()
}

export function parseJson(value, fallback = {}) {
  if (!value) {
    return fallback
  }

  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

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

export function logHookEvent(kind, payload, extra = {}) {
  appendFileSync(
    HOOK_AUDIT_FILE,
    `${JSON.stringify({
      at: new Date().toISOString(),
      kind,
      payload,
      ...extra,
    })}\n`,
    'utf8',
  )
}

export function allow(details = {}) {
  const output = { decision: 'allow', ...details }
  process.stdout.write(`${JSON.stringify(output)}\n`)
  process.exit(0)
}

export function block(reason, details = {}) {
  const output = { decision: 'block', reason, ...details }
  process.stdout.write(`${JSON.stringify(output)}\n`)
  process.exit(2)
}
