// src/tools/approval-tool.ts

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ToolResult } from '../types/tool-result.js'

/** 注册 approval_tool 工具到 MCP Server */
export function registerApprovalTool(mcpServer: McpServer): void {
  mcpServer.registerTool(
    'approval_tool',
    {
      description: 'Request explicit user approval before executing a high-risk or irreversible operation. Uses structured approval form instead of natural language.',
      inputSchema: {
        action: z.string().describe('The action that needs approval (e.g. "delete directory", "git push")'),
        riskSummary: z.string().describe('A brief summary of the risk involved'),
        diffSummary: z.string().optional().describe('Optional diff or change summary'),
      },
    },
    async (params) => {
      const message = [
        `**⚠️ 高风险操作审批**`,
        ``,
        `**操作**：${params.action}`,
        `**风险说明**：${params.riskSummary}`,
        params.diffSummary ? `**变更摘要**：${params.diffSummary}` : '',
        ``,
        `请确认是否批准执行此操作。`,
      ]
        .filter(Boolean)
        .join('\n')

      const elicitResult = await mcpServer.server.elicitInput({
        message,
        requestedSchema: {
          type: 'object' as const,
          properties: {
            approved: {
              type: 'string' as const,
              enum: ['true', 'false'],
              description: '是否批准（true = 批准，false = 拒绝）',
            },
            reason: {
              type: 'string' as const,
              description: '批准或拒绝的原因（可选）',
            },
          },
          required: ['approved'],
        },
      }, { timeout: 2_147_483_647 })

      // cancel
      if (elicitResult.action === 'cancel') {
        const result: ToolResult = {
          ok: false,
          code: 'USER_CANCELLED',
          message: '用户关闭了审批窗口，操作未执行。',
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        }
      }

      // decline
      if (elicitResult.action === 'decline') {
        const result: ToolResult = {
          ok: false,
          code: 'USER_DECLINED',
          message: '用户明确拒绝了此操作。',
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        }
      }

      // accept
      const content = elicitResult.content as { approved: string; reason?: string } | undefined
      const isApproved = content?.approved === 'true'
      if (isApproved) {
        const result: ToolResult<{ approved: true; reason?: string }> = {
          ok: true,
          code: 'OK',
          message: '用户已批准执行此操作。',
          data: { approved: true, reason: content?.reason },
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        }
      } else {
        const result: ToolResult<{ approved: false; reason?: string }> = {
          ok: false,
          code: 'USER_DECLINED',
          message: '用户拒绝了此操作。',
          data: { approved: false, reason: content?.reason },
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        }
      }
    }
  )
}
