// src/interaction/channel-mcp.ts

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

const log = (...args: unknown[]) => console.error('[channel-mcp]', ...args)

const ELICIT_TIMEOUT = { timeout: 2_147_483_647 }

const requestedSchema = {
  type: 'object' as const,
  properties: {
    msg: {
      type: 'string' as const,
      description: '你的反馈（留空表示完成）',
    },
  },
  required: [] as string[],
}

export type ElicitResult = {
  action: 'accept' | 'decline' | 'cancel'
  text: string
}

/** 通过 MCP elicitInput 收集用户输入 */
export async function elicit(mcpServer: McpServer, message: string): Promise<ElicitResult> {
  log('elicit:', message.slice(0, 100))

  const result = await mcpServer.server.elicitInput({ message, requestedSchema }, ELICIT_TIMEOUT)
  log('elicit result action:', result.action)

  if (result.action !== 'accept') {
    return { action: result.action as ElicitResult['action'], text: '' }
  }

  const msg = ((result.content as { msg?: string })?.msg ?? '').trim()
  return { action: 'accept', text: msg }
}
