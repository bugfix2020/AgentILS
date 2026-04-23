import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const STATE_FILE = resolve(process.env.AGENTILS_STATE_FILE ?? '.data/agentils-state.json')
export const HOOK_AUDIT_FILE = resolve(process.env.AGENTILS_HOOK_AUDIT_FILE ?? '.data/agentils-hook-audit.log')

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
