// src/tools/run-management-tool.ts

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Gateway, GatewayRequest } from '../gateway/gateway.js'
import type { Orchestrator } from '../orchestrator/orchestrator.js'
import type { MemoryStore } from '../store/memory-store.js'

/** 注册 Run 管理相关工具到 MCP Server */
export function registerRunManagementTools(
  mcpServer: McpServer,
  gateway: Gateway,
  orchestrator: Orchestrator,
  store: MemoryStore
): void {
  // —— 创建 Run ——
  mcpServer.registerTool(
    'create_run',
    {
      description: 'Create and validate a new agent run through the gateway. Checks user quota, plan limits, and access policies.',
      inputSchema: {
        sessionId: z.string().describe('Current session ID'),
        userId: z.string().optional().describe('Authenticated user ID (omit for anonymous)'),
        entryPrompt: z.string().describe('The initial user prompt'),
        selectedModel: z.string().describe('Model identifier (e.g. "claude-opus-4")'),
        selectedAgent: z.string().optional().describe('Agent name if applicable'),
        selectedPromptFile: z.string().optional().describe('Prompt file if applicable'),
        workspaceId: z.string().optional().describe('Workspace ID'),
      },
    },
    async (params) => {
      const req: GatewayRequest = {
        sessionId: params.sessionId,
        userId: params.userId,
        entryPrompt: params.entryPrompt,
        selectedModel: params.selectedModel,
        selectedAgent: params.selectedAgent,
        selectedPromptFile: params.selectedPromptFile,
        workspaceId: params.workspaceId,
      }

      const result = gateway.process(req)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      }
    }
  )

  // —— 启动 Run ——
  mcpServer.registerTool(
    'start_run',
    {
      description: 'Start a previously created run, transitioning it from "created" to "running" state.',
      inputSchema: {
        runId: z.string().describe('The run ID to start'),
      },
    },
    async (params) => {
      try {
        const run = orchestrator.startRun(params.runId)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, run }, null, 2) }],
        }
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err) }) }],
        }
      }
    }
  )

  // —— 完成 Run ——
  mcpServer.registerTool(
    'complete_run',
    {
      description: 'Mark a run as completed.',
      inputSchema: {
        runId: z.string().describe('The run ID to complete'),
      },
    },
    async (params) => {
      try {
        const run = store.getRun(params.runId)
        if (!run) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'Run not found' }) }],
          }
        }

        if (!run.feedbackCollected) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                ok: false,
                error:
                  'Feedback is required before completion. Call interactive_feedback with runId first.',
              }),
            }],
          }
        }

        orchestrator.completeRun(params.runId)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, message: 'Run completed' }) }],
        }
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err) }) }],
        }
      }
    }
  )

  // —— 取消 Run ——
  mcpServer.registerTool(
    'cancel_run',
    {
      description: 'Cancel a run.',
      inputSchema: {
        runId: z.string().describe('The run ID to cancel'),
      },
    },
    async (params) => {
      try {
        orchestrator.cancelRun(params.runId)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, message: 'Run cancelled' }) }],
        }
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err) }) }],
        }
      }
    }
  )

  // —— 查询 Run 快照 ——
  mcpServer.registerTool(
    'get_run',
    {
      description: 'Get the current snapshot of a run including its status, usage, budget, and steps.',
      inputSchema: {
        runId: z.string().describe('The run ID to query'),
      },
    },
    async (params) => {
      const snapshot = orchestrator.getRunSnapshot(params.runId)
      if (!snapshot) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'Run not found' }) }],
        }
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, ...snapshot }, null, 2) }],
      }
    }
  )
}
