import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { mcpLogger } from '../logger.js'
import type {
  AgentGateServerRuntime,
  ResourceNotifier,
} from './context.js'

function asJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function perTaskUris(taskId: string | null | undefined): string[] {
  if (!taskId) return ['state://current', 'state://interaction/pending']
  return [
    'state://current',
    `state://${taskId}`,
    `state://controlMode/${taskId}`,
    `state://timeline/${taskId}`,
    'state://interaction/pending',
  ]
}

export function registerGatewayResources(
  runtime: AgentGateServerRuntime,
): ResourceNotifier {
  const { server, orchestrator } = runtime
  const subscribers = new Map<string, number>()

  server.registerResource(
    'agentils-state-current',
    'state://current',
    {
      title: 'AgentILS State',
      description: 'Current AgentILS V1 task/session snapshot.',
      mimeType: 'application/json',
    },
    async () => ({
      contents: [
        { uri: 'state://current', text: asJson(orchestrator.stateGet()) },
      ],
    }),
  )

  server.registerResource(
    'agentils-state-by-task',
    new ResourceTemplate('state://{taskId}', { list: undefined }),
    {
      title: 'AgentILS State',
      description: 'AgentILS V1 task/session snapshot for a specific task.',
      mimeType: 'application/json',
    },
    async (_uri, variables) => {
      const taskId = String(variables.taskId ?? '')
      return {
        contents: [
          { uri: `state://${taskId}`, text: asJson(orchestrator.stateGet(taskId)) },
        ],
      }
    },
  )

  server.registerResource(
    'agentils-control-mode',
    new ResourceTemplate('state://controlMode/{taskId}', { list: undefined }),
    {
      title: 'AgentILS Control Mode',
      description: 'Current control mode (normal/alternate/direct) for a task.',
      mimeType: 'application/json',
    },
    async (_uri, variables) => {
      const taskId = String(variables.taskId ?? '')
      const snapshot = orchestrator.stateGet(taskId)
      return {
        contents: [
          {
            uri: `state://controlMode/${taskId}`,
            text: asJson({
              taskId,
              controlMode: snapshot.task?.controlMode ?? null,
              terminal: snapshot.task?.terminal ?? null,
              phase: snapshot.task?.phase ?? null,
            }),
          },
        ],
      }
    },
  )

  server.registerResource(
    'agentils-pending-interaction',
    'state://interaction/pending',
    {
      title: 'AgentILS Pending Interaction',
      description:
        'The interaction the active task is currently awaiting from the user, or null.',
      mimeType: 'application/json',
    },
    async () => {
      const snapshot = orchestrator.stateGet()
      return {
        contents: [
          {
            uri: 'state://interaction/pending',
            text: asJson({
              taskId: snapshot.task?.taskId ?? null,
              interaction: snapshot.task?.pendingInteraction ?? null,
            }),
          },
        ],
      }
    },
  )

  server.registerResource(
    'agentils-task-timeline',
    new ResourceTemplate('state://timeline/{taskId}', { list: undefined }),
    {
      title: 'AgentILS Task Timeline',
      description: 'Session timeline events related to a given task.',
      mimeType: 'application/json',
    },
    async (_uri, variables) => {
      const taskId = String(variables.taskId ?? '')
      const snapshot = orchestrator.stateGet(taskId)
      return {
        contents: [
          {
            uri: `state://timeline/${taskId}`,
            text: asJson({ taskId, events: snapshot.timeline }),
          },
        ],
      }
    },
  )

  server.server.setRequestHandler(SubscribeRequestSchema, async (request) => {
    const uri = request.params.uri
    subscribers.set(uri, (subscribers.get(uri) ?? 0) + 1)
    mcpLogger.debug('gateway/resources', 'subscribe', { uri, count: subscribers.get(uri) })
    return {}
  })
  server.server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
    const uri = request.params.uri
    const remaining = (subscribers.get(uri) ?? 0) - 1
    if (remaining <= 0) subscribers.delete(uri)
    else subscribers.set(uri, remaining)
    mcpLogger.debug('gateway/resources', 'unsubscribe', { uri, count: subscribers.get(uri) ?? 0 })
    return {}
  })

  const notifier: ResourceNotifier = {
    notify(uri) {
      if (!subscribers.has(uri)) return
      Promise.resolve(server.server.sendResourceUpdated({ uri })).catch((err) => {
        mcpLogger.error('gateway/resources', 'notify:failed', {
          uri,
          error: err instanceof Error ? err.message : String(err),
        })
      })
    },
    notifyTask(taskId) {
      for (const uri of perTaskUris(taskId)) this.notify(uri)
    },
  }

  return notifier
}
