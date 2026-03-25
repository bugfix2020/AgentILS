// src/tools/policy-management-tool.ts

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { MemoryStore } from '../store/memory-store.js'
import type { ToolRiskLevel } from '../types/tool-policy.js'

/** 注册工具策略管理工具到 MCP Server */
export function registerPolicyManagementTools(mcpServer: McpServer, store: MemoryStore): void {
  // —— 查询工具策略 ——
  mcpServer.registerTool(
    'get_tool_policy',
    {
      description: 'Get the policy configuration for a specific tool, or list all tool policies.',
      inputSchema: {
        toolName: z.string().optional().describe('Tool name to query. If omitted, returns all policies.'),
      },
    },
    async (params) => {
      if (params.toolName) {
        const policy = store.getToolPolicy(params.toolName)
        if (!policy) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'Policy not found' }) }],
          }
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, policy }, null, 2) }],
        }
      }

      const policies = store.getAllToolPolicies()
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ ok: true, count: policies.length, policies }, null, 2),
        }],
      }
    }
  )

  // —— 设置工具策略 ——
  mcpServer.registerTool(
    'set_tool_policy',
    {
      description: 'Create or update the policy for a specific tool. Controls risk level, approval requirements, and access restrictions.',
      inputSchema: {
        toolName: z.string().describe('Tool name'),
        riskLevel: z.enum(['low', 'medium', 'high']).describe('Risk level classification'),
        requiresApproval: z.boolean().describe('Whether the tool requires user approval before execution'),
        requiresVerifiedEmail: z.boolean().optional().describe('Whether verified email is required'),
        requiresAllowlistedEmail: z.boolean().optional().describe('Whether allowlisted email is required'),
        allowedAgents: z.array(z.string()).optional().describe('Restrict to specific agent names'),
        allowedPromptFiles: z.array(z.string()).optional().describe('Restrict to specific prompt files'),
      },
    },
    async (params) => {
      store.setToolPolicy({
        toolName: params.toolName,
        riskLevel: params.riskLevel as ToolRiskLevel,
        requiresApproval: params.requiresApproval,
        requiresVerifiedEmail: params.requiresVerifiedEmail ?? false,
        requiresAllowlistedEmail: params.requiresAllowlistedEmail ?? false,
        allowedAgents: params.allowedAgents,
        allowedPromptFiles: params.allowedPromptFiles,
      })

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, message: `Policy for "${params.toolName}" saved` }) }],
      }
    }
  )

  // —— 查询访问策略 ——
  mcpServer.registerTool(
    'get_access_policy',
    {
      description: 'Get the current access policy configuration, including allowlists, blocked tools, and high-risk tools.',
      inputSchema: {
        policyId: z.string().optional().describe('Access policy ID (default: "default")'),
      },
    },
    async (params) => {
      const policy = store.getAccessPolicy(params.policyId ?? 'default')
      if (!policy) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'Access policy not found' }) }],
        }
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, policy }, null, 2) }],
      }
    }
  )
}
