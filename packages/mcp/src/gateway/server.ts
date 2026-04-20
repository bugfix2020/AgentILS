import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { defaultConfig, type AgentGateConfig } from '../config/defaults.js'
import { AgentGateOrchestrator } from '../orchestrator/orchestrator.js'
import { AgentGateMemoryStore } from '../store/memory-store.js'
import { JsonlLogger } from '../logger.js'
import { registerGatewayPrompts } from './prompts.js'
import { registerGatewayResources } from './resources.js'
import { registerGatewayTools } from './tools.js'
import type { AgentGateServerDependencies, AgentGateServerRuntime } from './context.js'

export function createAgentGateServer(
  config: AgentGateConfig = defaultConfig,
  dependencies: AgentGateServerDependencies = {},
): AgentGateServerRuntime {
  // 启用 MCP 日志（默认启用以进行诊断）
  const debugMode = process.env.AGENTILS_DEBUG === 'true' || true  // 暂时默认启用
  if (debugMode) {
    JsonlLogger.enable()
    JsonlLogger.info('mcp', 'server', 'createAgentGateServer_start', { debugEnabled: true })
  }

  const store = dependencies.store ?? new AgentGateMemoryStore()
  const orchestrator = dependencies.orchestrator ?? new AgentGateOrchestrator(store)
  const server = new McpServer({
    name: config.serverName,
    version: config.serverVersion,
  })

  const runtime: AgentGateServerRuntime = {
    server,
    store,
    orchestrator,
    config,
  }

  registerGatewayTools(runtime)
  registerGatewayPrompts(runtime)
  registerGatewayResources(runtime)

  return runtime
}
