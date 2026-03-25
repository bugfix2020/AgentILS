// src/tools/audit-query-tool.ts

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { MemoryStore } from '../store/memory-store.js'

/** 注册审计日志查询工具到 MCP Server */
export function registerAuditQueryTool(mcpServer: McpServer, store: MemoryStore): void {
  mcpServer.registerTool(
    'query_audit_log',
    {
      description: 'Query audit events by run ID or user ID. Returns a list of audit log entries.',
      inputSchema: {
        runId: z.string().optional().describe('Filter by run ID'),
        userId: z.string().optional().describe('Filter by user ID'),
        limit: z.number().optional().describe('Max number of events to return (default: 50)'),
      },
    },
    async (params) => {
      let events: ReturnType<typeof store.getAuditEventsByRunId> = []
      const limit = typeof params.limit === 'number' ? params.limit : 50

      if (params.runId) {
        events = store.getAuditEventsByRunId(params.runId)
      } else if (params.userId) {
        events = store.getAuditEventsByUserId(params.userId)
      }

      const limited = events.slice(0, limit)

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ ok: true, count: limited.length, events: limited }, null, 2),
        }],
      }
    }
  )
}
