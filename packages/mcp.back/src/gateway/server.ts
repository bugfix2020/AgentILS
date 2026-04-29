import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { defaultConfig, type AgentGateConfig } from '../config/defaults.js'
import { mcpLogger } from '../logger.js'
import { AgentGateOrchestrator } from '../orchestrator/orchestrator.js'
import { AgentGateMemoryStore } from '../store/memory-store.js'
import { registerGatewayPrompts } from './prompts.js'
import { registerGatewayResources } from './resources.js'
import { registerGatewayTools } from './tools.js'
import type { AgentGateServerDependencies, AgentGateServerRuntime } from './context.js'

export function createAgentGateServer(
  config: AgentGateConfig = defaultConfig,
  dependencies: AgentGateServerDependencies = {},
): AgentGateServerRuntime {
  mcpLogger.info('gateway/server', 'createAgentGateServer:start', {
    serverName: config.serverName,
    serverVersion: config.serverVersion,
    env: process.env.AGENTILS_ENV ?? null,
  })
  const store = dependencies.store ?? new AgentGateMemoryStore()
  const orchestrator = dependencies.orchestrator ?? new AgentGateOrchestrator(store)
  const server = new McpServer(
    {
      name: config.serverName,
      version: config.serverVersion,
    },
    {
      // Phase 4: enable resource subscriptions so the extension/Webview
      // can react to push updates instead of polling. Verified by
      // test/runtime/phase4-feasibility.test.ts.
      capabilities: {
        resources: { subscribe: true, listChanged: true },
      },
    },
  )

  // Construct runtime with a placeholder notifier; real notifier replaces
  // it once registerGatewayResources runs (resources.ts owns subscriber
  // bookkeeping).
  const noopNotifier = { notify: () => {}, notifyTask: () => {} }
  const runtime: AgentGateServerRuntime = {
    server,
    store,
    orchestrator,
    config,
    notifier: noopNotifier,
    disposeNotifier: () => {},
  }

  registerGatewayTools(runtime)
  registerGatewayPrompts(runtime)
  runtime.notifier = registerGatewayResources(runtime)
  // Register this runtime's notifier with the orchestrator. Multiple
  // runtimes (one per connected client) may register concurrently; each
  // one returns a disposable so transports can release on close.
  const registration = orchestrator.addNotifier(runtime.notifier)
  runtime.disposeNotifier = registration.dispose

  mcpLogger.info('gateway/server', 'createAgentGateServer:done')

  return runtime
}
