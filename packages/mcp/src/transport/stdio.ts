/**
 * stdio MCP transport — exposes the AgentILS tools to non-VS Code IDEs
 * (Claude Desktop, Cursor, etc.) following the standard MCP spec.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import type { Orchestrator } from '../orchestrator/orchestrator.js'
import type { ToolName } from '../types/index.js'

const baseInput = {
  question: z.string().min(1),
  context: z.string().optional(),
  placeholder: z.string().optional(),
}

export function buildMcpServer(orchestrator: Orchestrator): McpServer {
  const server = new McpServer({
    name: 'agentils-mcp',
    version: '0.1.0',
  })

  const register = (toolName: ToolName, description: string) => {
    server.registerTool(
      toolName,
      {
        description,
        inputSchema: baseInput,
      },
      async (args) => {
        const response = await orchestrator.park({
          toolName,
          question: args.question,
          context: args.context,
          placeholder: args.placeholder,
        })
        return {
          content: [
            { type: 'text', text: response.text },
          ],
        }
      },
    )
  }

  register('request_user_clarification', 'Ask the user a clarifying question.')
  register('request_contact_user', 'Proactively contact the user.')
  register('request_user_feedback', 'Collect feedback from the user after a task.')

  server.registerTool(
    'request_dynamic_action',
    {
      description: 'Generic action dispatch (action + params).',
      inputSchema: {
        action: z.string().min(1),
        params: z.record(z.unknown()).optional(),
      },
    },
    async (args) => {
      const params = args.params ?? {}
      const question = (params.question as string | undefined) ?? `dynamic:${args.action}`
      const response = await orchestrator.park({
        toolName: 'request_dynamic_action',
        question,
        action: args.action,
        params,
      })
      return {
        content: [{ type: 'text', text: response.text }],
      }
    },
  )

  return server
}

export async function startStdioTransport(orchestrator: Orchestrator): Promise<void> {
  const server = buildMcpServer(orchestrator)
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
