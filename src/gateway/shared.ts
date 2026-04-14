import type { OverrideState } from '../control/override-policy.js'
import type { TaskRecordView } from '../store/task-store.js'
import type { TaskSummaryDocument } from '../store/summary-store.js'
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

export interface GatewayRunSnapshot {
  runId: string
  taskId: string
  run: RunRecord
  taskRecord: TaskRecordView
  taskSummary: ReturnType<AgentGateMemoryStore['getTaskSummary']>
  summaryDocument: TaskSummaryDocument | null
  overrideState: OverrideState | null
  nextAction: string
}

export function readGatewayRunSnapshot(
  store: Pick<
    AgentGateMemoryStore,
    'resolveRunId' | 'requireRun' | 'getCurrentOverrideState' | 'getTaskRecord' | 'getTaskSummary' | 'readTaskSummary'
  > & {
    conversationStore: Pick<AgentGateMemoryStore['conversationStore'], 'summarizeNextAction'>
  },
  preferredRunId?: string | null,
): GatewayRunSnapshot | null {
  const resolved = resolveRun(store, preferredRunId)
  if (!resolved) {
    return null
  }

  const overrideState = store.getCurrentOverrideState(resolved.runId)
  const taskRecord = store.getTaskRecord(resolved.runId, resolved.run.summaryDocumentPath)
  const taskSummary = store.getTaskSummary(resolved.runId)
  const summaryDocument = store.readTaskSummary(resolved.run.taskId)

  return {
    runId: resolved.runId,
    taskId: resolved.run.taskId,
    run: resolved.run,
    taskRecord,
    taskSummary,
    summaryDocument,
    overrideState,
    nextAction: store.conversationStore.summarizeNextAction(resolved.run, overrideState),
  }
}

export function buildActiveTaskSnapshot(snapshot: GatewayRunSnapshot | null) {
  if (!snapshot) {
    return null
  }

  return {
    runId: snapshot.runId,
    taskId: snapshot.taskId,
    title: snapshot.run.title,
    goal: snapshot.run.goal,
    conversationMode: snapshot.run.currentMode,
    controlMode: snapshot.run.controlMode,
    currentStep: snapshot.run.currentStep,
    currentStatus: snapshot.run.currentStatus,
  }
}
