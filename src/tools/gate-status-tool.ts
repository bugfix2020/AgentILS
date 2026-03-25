// src/tools/gate-status-tool.ts

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { MemoryStore } from '../store/memory-store.js'

export function registerGateStatusTool(mcpServer: McpServer, store: MemoryStore): void {
  mcpServer.registerTool(
    'gate_status',
    {
      description: 'Check current quota and identity status. Call directly with no parameters. Returns plan name, monthly run limit, runs used, runs remaining.',
    },
    async (extra) => {
      const plan = store.getPlan('anonymous')
      const sessionId = extra.sessionId ?? 'default'
      const monthlyRuns = store.countAnonymousMonthlyRuns(sessionId)

      const result = {
        loggedIn: false,
        planName: plan?.name ?? 'Anonymous',
        monthlyRunLimit: plan?.monthlyRunLimit ?? 0,
        monthlyRunsUsed: monthlyRuns,
        monthlyRunsRemaining: Math.max(0, (plan?.monthlyRunLimit ?? 0) - monthlyRuns),
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      }
    }
  )
}
