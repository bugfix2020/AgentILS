import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AgentGateConfig } from '../config/defaults.js'
import type { AgentGateOrchestrator } from '../orchestrator/orchestrator.js'
import type { AgentGateMemoryStore } from '../store/memory-store.js'

/**
 * Pushes resource updates to subscribed clients (Phase 4).
 * `notifyTask(taskId)` is a convenience that fans out to every per-task
 * resource URI so callers don't have to remember the full set.
 */
export interface ResourceNotifier {
  notify(uri: string): void
  notifyTask(taskId: string | null | undefined): void
}

export interface AgentGateServerRuntime {
  server: McpServer
  store: AgentGateMemoryStore
  orchestrator: AgentGateOrchestrator
  config: AgentGateConfig
  notifier: ResourceNotifier
  /**
   * Releases this runtime's notifier registration on the orchestrator.
   * Call when the underlying transport closes so push notifications stop
   * being sent to a dead client.
   */
  disposeNotifier: () => void
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
