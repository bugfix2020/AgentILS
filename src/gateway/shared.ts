import type { RunRecord } from '../types/index.js'
import type { AgentGateMemoryStore } from '../store/memory-store.js'

export function asJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

export function textResult(label: string, value: unknown, isError = false) {
  return {
    content: [
      {
        type: 'text' as const,
        text: `${label}\n${asJson(value)}`,
      },
    ],
    isError,
  }
}

export function resolveRunId(store: Pick<AgentGateMemoryStore, 'resolveRunId'>, preferredRunId?: string | null): string | null {
  return store.resolveRunId(preferredRunId)
}

export function resolveRun(
  store: Pick<AgentGateMemoryStore, 'resolveRunId' | 'requireRun'>,
  preferredRunId?: string | null,
): { runId: string; run: RunRecord } | null {
  const runId = resolveRunId(store, preferredRunId)
  if (!runId) {
    return null
  }
  return {
    runId,
    run: store.requireRun(runId),
  }
}
