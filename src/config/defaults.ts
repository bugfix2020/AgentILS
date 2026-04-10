export interface AgentGateConfig {
  serverName: string
  serverVersion: string
  policy: {
    allowDangerousTools: boolean
    protectedPaths: string[]
  }
}

export const defaultConfig: AgentGateConfig = {
  serverName: 'agent-gate',
  serverVersion: '0.1.0-greenfield',
  policy: {
    allowDangerousTools: false,
    protectedPaths: ['.github/hooks', 'services/control-plane'],
  },
}
