import { randomUUID } from 'node:crypto'
import type { Server as HttpServer } from 'node:http'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AgentGateConfig } from '../config/defaults.js'
import type { AgentGateMemoryStore } from '../store/memory-store.js'
import type { AgentGateOrchestrator } from '../orchestrator/orchestrator.js'

export interface AgentGateServerRuntime {
  server: McpServer
  store: AgentGateMemoryStore
  orchestrator: AgentGateOrchestrator
  config: AgentGateConfig
}

export interface AgentGateServerDependencies {
  store?: AgentGateMemoryStore
  orchestrator?: AgentGateOrchestrator
}

export interface AgentGateElicitParams {
  mode: string
  message?: string
  requestedSchema?: Record<string, unknown>
  [key: string]: unknown
}

export interface AgentGateElicitResult {
  action: string
  content?: Record<string, unknown> | null
}

export interface AgentGateRequestContext {
  runId?: string
  conversationId?: string
  taskId?: string
  traceId: string
  interactionAllowed: boolean
  now: () => string
  elicitUser: (params: AgentGateElicitParams) => Promise<AgentGateElicitResult>
}

export interface CreateAgentGateRequestContextInput {
  runId?: string | null
  conversationId?: string | null
  taskId?: string | null
  traceId?: string
  interactionAllowed?: boolean
  now?: () => string
}

export interface AgentGateHttpRuntime {
  store: AgentGateMemoryStore
  orchestrator: AgentGateOrchestrator
  config: AgentGateConfig
  host: string
  port: number
  url: string
  close: () => Promise<void>
}

export type AgentGateTransportHost = HttpServer

export function createAgentGateRequestContext(
  runtime: Pick<AgentGateServerRuntime, 'server'>,
  input: CreateAgentGateRequestContextInput = {},
): AgentGateRequestContext {
  const interactionAllowed = input.interactionAllowed ?? true
  const now = input.now ?? (() => new Date().toISOString())

  return {
    runId: input.runId ?? undefined,
    conversationId: input.conversationId ?? undefined,
    taskId: input.taskId ?? undefined,
    traceId: input.traceId ?? `req_${randomUUID()}`,
    interactionAllowed,
    now,
    async elicitUser(params: AgentGateElicitParams): Promise<AgentGateElicitResult> {
      if (!interactionAllowed) {
        throw new Error('User interaction is not allowed in the current request context.')
      }

      return (await runtime.server.server.elicitInput(params as never)) as AgentGateElicitResult
    },
  }
}
