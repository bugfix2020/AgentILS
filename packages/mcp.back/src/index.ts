import { startIfEntrypoint } from './gateway/gateway.js'

export { createAgentGateServer, startIfEntrypoint, startStdioServer, startStreamableHttpServer } from './gateway/gateway.js'
export { AgentGateOrchestrator } from './orchestrator/orchestrator.js'
export { AgentGateMemoryStore } from './store/memory-store.js'
export { defaultConfig } from './config/defaults.js'
export * from './types/index.js'

await startIfEntrypoint()
