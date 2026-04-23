export interface AgentGateConfig {
  serverName: string
  serverVersion: string
}

export const defaultConfig: AgentGateConfig = {
  serverName: 'agentils-v1',
  serverVersion: '1.0.0',
}
