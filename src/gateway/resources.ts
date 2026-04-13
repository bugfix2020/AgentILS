import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AgentGateServerRuntime } from './context.js'
import { asJson, resolveRun } from './shared.js'

export function registerGatewayResources(runtime: AgentGateServerRuntime): void {
  const { server, store } = runtime

  server.registerResource(
    'conversation-resource',
    'conversation://current',
    {
      title: 'Conversation',
      description: 'Current conversation state and the active task snapshot.',
      mimeType: 'application/json',
    },
    async () => {
      const snapshot = resolveRun(store)
      const conversation = store.getConversationRecord()

      return {
        contents: [
          {
            uri: 'conversation://current',
            text: asJson({
              conversation,
              activeTask: snapshot
                ? {
                    runId: snapshot.runId,
                    taskId: snapshot.run.taskId,
                    title: snapshot.run.title,
                    goal: snapshot.run.goal,
                    conversationMode: snapshot.run.currentMode,
                    controlMode: snapshot.run.controlMode,
                    currentStep: snapshot.run.currentStep,
                    currentStatus: snapshot.run.currentStatus,
                  }
                : null,
              taskRecord: snapshot
                ? store.getTaskRecord(snapshot.runId, snapshot.run.summaryDocumentPath)
                : null,
              taskSummary: snapshot ? store.getTaskSummary(snapshot.runId) : null,
              summaryDocument: snapshot ? store.readTaskSummary(snapshot.run.taskId) : null,
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
      const snapshot = resolveRun(store, runId)
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
              taskId: snapshot.run.taskId,
              taskSummary: store.getTaskSummary(snapshot.runId),
              summaryDocument: store.readTaskSummary(snapshot.run.taskId),
              summaryAvailable: Boolean(store.readTaskSummary(snapshot.run.taskId)),
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
      const snapshot = resolveRun(store, runId)
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
