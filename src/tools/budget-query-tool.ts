// src/tools/budget-query-tool.ts

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { MemoryStore } from '../store/memory-store.js'
import { isWithinBudget } from '../budget/budget-checker.js'

/** 注册预算查询工具到 MCP Server */
export function registerBudgetQueryTool(mcpServer: McpServer, store: MemoryStore): void {
  mcpServer.registerTool(
    'check_budget',
    {
      description: 'Check the remaining budget for a specific run. Returns current usage vs limits and whether the run is still within budget.',
      inputSchema: {
        runId: z.string().describe('The run ID to check budget for'),
      },
    },
    async (params) => {
      const run = store.getRun(params.runId)
      if (!run) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'Run not found' }) }],
        }
      }

      const withinBudget = isWithinBudget(run)
      const totalTokens = run.usage.promptTokens + run.usage.completionTokens
      const elapsed = Date.now() - new Date(run.startedAt).getTime()

      const result = {
        ok: true,
        runId: run.id,
        withinBudget,
        budget: run.budget,
        usage: run.usage,
        remaining: {
          llmSteps: Math.max(0, run.budget.maxLlmSteps - run.usage.llmSteps),
          toolCalls: Math.max(0, run.budget.maxToolCalls - run.usage.toolCalls),
          userResumes: Math.max(0, run.budget.maxUserResumes - run.usage.userResumes),
          tokens: Math.max(0, run.budget.maxTokens - totalTokens),
          wallClockMs: Math.max(0, run.budget.maxWallClockMs - elapsed),
        },
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      }
    }
  )
}
