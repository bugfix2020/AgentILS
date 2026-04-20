import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AgentGateServerRuntime } from './context.js'
import { asJson, buildActiveTaskSnapshot, readGatewayRunSnapshot } from './shared.js'

function buildRunSnapshotResourcePayload(runtime: AgentGateServerRuntime, preferredRunId?: string | null) {
  const snapshot = readGatewayRunSnapshot(runtime.store, preferredRunId)

  return {
    resolvedRunId: snapshot?.runId ?? null,
    conversation: runtime.store.getConversationRecord(preferredRunId),
    run: snapshot?.run ?? null,
    activeTask: buildActiveTaskSnapshot(snapshot),
    taskRecord: snapshot?.taskRecord ?? null,
    taskSummary: snapshot?.taskSummary ?? null,
    summaryDocument: snapshot?.summaryDocument ?? null,
    controlMode: snapshot?.run.controlMode ?? null,
    overrideState: snapshot?.overrideState ?? null,
    nextAction: snapshot?.nextAction ?? 'await_next_task',
  }
}

export function registerGatewayResources(runtime: AgentGateServerRuntime): void {
  const { server, store } = runtime

  server.registerResource(
    'run-snapshot-current',
    'run-snapshot://current',
    {
      title: 'Run Snapshot',
      description: 'Unified read model for the current conversation, run, task, control mode, summary, and next action.',
      mimeType: 'application/json',
    },
    async () => ({
      contents: [
        {
          uri: 'run-snapshot://current',
          text: asJson(buildRunSnapshotResourcePayload(runtime)),
        },
      ],
    }),
  )

  server.registerResource(
    'run-snapshot-resource',
    new ResourceTemplate('run-snapshot://{runId}', { list: undefined }),
    {
      title: 'Run Snapshot',
      description: 'Unified read model for a run, including conversation, active task, summary, control mode, and next action.',
      mimeType: 'application/json',
    },
    async (_uri, variables) => {
      const runId = String(variables.runId ?? '')
      return {
        contents: [
          {
            uri: `run-snapshot://${runId}`,
            text: asJson(buildRunSnapshotResourcePayload(runtime, runId)),
          },
        ],
      }
    },
  )

  server.registerResource(
    'conversation-resource',
    'conversation://current',
    {
      title: 'Conversation',
      description: 'Current conversation state and the active task snapshot.',
      mimeType: 'application/json',
    },
    async () => {
      const snapshot = readGatewayRunSnapshot(store)
      const conversation = store.getConversationRecord(snapshot?.runId)

      return {
        contents: [
          {
            uri: 'conversation://current',
            text: asJson({
              conversation,
              activeTask: buildActiveTaskSnapshot(snapshot),
              taskRecord: snapshot?.taskRecord ?? null,
              taskSummary: snapshot?.taskSummary ?? null,
              summaryDocument: snapshot?.summaryDocument ?? null,
            }),
          },
        ],
      }
    },
  )

  server.registerResource(
    'session-resource',
    'session://current',
    {
      title: 'Session',
      description: 'Current AgentILS session transcript and pending interaction state.',
      mimeType: 'application/json',
    },
    async () => {
      const snapshot = readGatewayRunSnapshot(store)
      return {
        contents: [
          {
            uri: 'session://current',
            text: asJson({
              session: store.getCurrentSession(snapshot?.runId),
            }),
          },
        ],
      }
    },
  )

  server.registerResource(
    'session-resource-by-run',
    new ResourceTemplate('session://{runId}', { list: undefined }),
    {
      title: 'Session',
      description: 'AgentILS session transcript and pending interaction for a run.',
      mimeType: 'application/json',
    },
    async (_uri, variables) => {
      const runId = String(variables.runId ?? '')
      return {
        contents: [
          {
            uri: `session://${runId}`,
            text: asJson({
              session: store.getCurrentSession(runId),
            }),
          },
        ],
      }
    },
  )

  server.registerResource(
    'task-summary-resource',
    new ResourceTemplate('task-summary://{runId}', { list: undefined }),
    {
      title: 'Task Summary',
      description: 'Task summary document and synthesized summary view for a run.',
      mimeType: 'application/json',
    },
    async (_uri, variables) => {
      const runId = String(variables.runId ?? '')
      const snapshot = readGatewayRunSnapshot(store, runId)
      if (!snapshot) {
        return {
          contents: [
            {
              uri: `task-summary://${runId}`,
              text: asJson({ error: 'No run has been started yet.' }),
            },
          ],
        }
      }

      return {
        contents: [
          {
            uri: `task-summary://${runId}`,
            text: asJson({
              runId: snapshot.runId,
              taskId: snapshot.taskId,
              taskSummary: snapshot.taskSummary,
              summaryDocument: snapshot.summaryDocument,
              summaryAvailable: Boolean(snapshot.summaryDocument),
              summaryPath: snapshot.run.summaryDocumentPath ?? null,
            }),
          },
        ],
      }
    },
  )

  server.registerResource(
    'control-mode-resource',
    new ResourceTemplate('control-mode://{runId}', { list: undefined }),
    {
      title: 'Control Mode',
      description: 'Current control mode and override state for a run.',
      mimeType: 'application/json',
    },
    async (_uri, variables) => {
      const runId = String(variables.runId ?? '')
      const snapshot = readGatewayRunSnapshot(store, runId)
      if (!snapshot) {
        return {
          contents: [
            {
              uri: `control-mode://${runId}`,
              text: asJson({ error: 'No run has been started yet.' }),
            },
          ],
        }
      }

      const overrideState = store.getCurrentOverrideState(snapshot.runId)

      return {
        contents: [
          {
            uri: `control-mode://${runId}`,
            text: asJson({
              runId: snapshot.runId,
              taskId: snapshot.run.taskId,
              controlMode: snapshot.run.controlMode,
              isOverrideActive: Boolean(overrideState?.confirmed),
              overrideState,
              nextAction: store.conversationStore.summarizeNextAction(snapshot.run, overrideState),
            }),
          },
        ],
      }
    },
  )

  server.registerResource(
    'taskcard-resource',
    new ResourceTemplate('taskcard://{runId}', { list: undefined }),
    {
      title: 'TaskCard',
      description: 'Structured task state for a run.',
      mimeType: 'application/json',
    },
    async (_uri, variables) => {
      const runId = String(variables.runId ?? '')
      return {
        contents: [
          {
            uri: `taskcard://${runId}`,
            text: asJson(store.requireTaskCard(runId)),
          },
        ],
      }
    },
  )

  server.registerResource(
    'handoff-resource',
    new ResourceTemplate('handoff://{runId}', { list: undefined }),
    {
      title: 'HandoffPacket',
      description: 'Structured handoff data for a run.',
      mimeType: 'application/json',
    },
    async (_uri, variables) => {
      const runId = String(variables.runId ?? '')
      return {
        contents: [
          {
            uri: `handoff://${runId}`,
            text: asJson(store.requireHandoff(runId)),
          },
        ],
      }
    },
  )

  server.registerResource(
    'runlog-resource',
    new ResourceTemplate('runlog://{runId}', { list: undefined }),
    {
      title: 'RunLog',
      description: 'Audit and lifecycle log for a run.',
      mimeType: 'application/json',
    },
    async (_uri, variables) => {
      const runId = String(variables.runId ?? '')
      return {
        contents: [
          {
            uri: `runlog://${runId}`,
            text: asJson({
              audit: store.listAuditEvents(runId),
              events: store.listRunEvents(runId),
            }),
          },
        ],
      }
    },
  )

  server.registerResource(
    'policy-current',
    'policy://current',
    {
      title: 'Current Policy',
      description: 'Current runtime policy summary.',
      mimeType: 'application/json',
    },
    async () => ({
      contents: [
        {
          uri: 'policy://current',
          text: asJson(runtime.config.policy),
        },
      ],
    }),
  )
}
