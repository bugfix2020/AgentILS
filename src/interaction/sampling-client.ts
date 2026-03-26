// src/interaction/sampling-client.ts

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { INTERACTION_DEFAULTS } from '../config/defaults.js'

const log = (...args: unknown[]) => console.error('[sampling-client]', ...args)

/** 截断上下文到最大字符数 */
function trimContext(text: string, max = INTERACTION_DEFAULTS.contextMaxChars): string {
  if (text.length <= max) return text
  return text.slice(0, max) + '\n...(truncated)'
}

/** 检查客户端是否支持 sampling */
export function isSamplingAvailable(mcpServer: McpServer): boolean {
  try {
    const caps = mcpServer.server.getClientCapabilities()
    return !!caps?.sampling
  } catch {
    return false
  }
}

/** 调用 createMessage 进行反向 LLM 推理 */
export async function tryCreateMessage(
  mcpServer: McpServer,
  userFeedback: string,
  context: string,
): Promise<string | null> {
  if (!isSamplingAvailable(mcpServer)) {
    log('sampling not available, skipping createMessage')
    return null
  }

  try {
    const trimmed = trimContext(context)
    const result = await mcpServer.server.createMessage({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `上下文：\n${trimmed}\n\n用户反馈：\n${userFeedback}`,
          },
        },
      ],
      maxTokens: INTERACTION_DEFAULTS.samplingMaxTokens,
      systemPrompt:
        '你是编程助手，正在与用户进行多轮反馈讨论。请根据上下文和用户的反馈给出简洁、有针对性的回复。使用中文。',
    })

    if (result.content.type === 'text') {
      log('createMessage OK, response length:', result.content.text.length)
      return result.content.text
    }
    return null
  } catch (err) {
    log('createMessage failed:', err)
    return null
  }
}
