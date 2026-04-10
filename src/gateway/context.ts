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
