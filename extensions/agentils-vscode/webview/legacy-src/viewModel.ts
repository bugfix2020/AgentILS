import { normalizeContent, getEventTitle } from './utils'
import type { AgentILSPanelState, AgentILSPendingInteraction, AgentILSSessionMessage } from './types'

/**
 * 转录项类型定义
 */
export type TranscriptItemKind = 'chat_message' | 'system_event' | 'tool_event' | 'guided_prompt_card'

export interface TranscriptItemBase {
  id: string
  kind: TranscriptItemKind
  timestamp: string
}

export interface TranscriptChatMessage extends TranscriptItemBase {
  kind: 'chat_message'
  role: 'user' | 'assistant'
  content: string
  state: AgentILSSessionMessage['state']
}

export interface TranscriptEventMessage extends TranscriptItemBase {
  kind: 'system_event' | 'tool_event'
  title: string
  content: string
}

export interface GuidedPromptCard extends TranscriptItemBase {
  kind: 'guided_prompt_card'
  interaction: AgentILSPendingInteraction
}

export type TranscriptViewModel = TranscriptChatMessage | TranscriptEventMessage | GuidedPromptCard

/**
 * 将会话消息转换为转录视图模型
 */
export function toTranscriptMessages(messages: AgentILSSessionMessage[]): TranscriptViewModel[] {
  const items: TranscriptViewModel[] = []
  for (const message of messages) {
    const normalizedContent = normalizeContent((message as { content?: unknown }).content)
    if (message.kind === 'text' && (message.role === 'user' || message.role === 'assistant')) {
      const last = items.at(-1)
      if (last && last.kind === 'chat_message' && last.role === message.role && last.state === message.state) {
        last.content = `${last.content}${normalizedContent}`
        last.timestamp = message.timestamp
        continue
      }
      items.push({ id: message.id, kind: 'chat_message', role: message.role, content: normalizedContent, timestamp: message.timestamp, state: message.state })
      continue
    }
    items.push({ id: message.id, kind: message.role === 'tool' ? 'tool_event' : 'system_event', title: getEventTitle(message), content: normalizedContent, timestamp: message.timestamp })
  }
  return items
}

/**
 * 构建完整的转录视图模型（包括待处理的交互）
 */
export function buildTranscriptViewModel(state: AgentILSPanelState): TranscriptViewModel[] {
  const session = state.snapshot.session
  const baseItems = toTranscriptMessages(session?.messages ?? [])
  if (state.pendingInteraction) {
    baseItems.push({ id: `guided_${state.pendingInteraction.requestId}`, kind: 'guided_prompt_card', interaction: state.pendingInteraction, timestamp: state.pendingInteraction.requestId })
  }
  return baseItems
}
