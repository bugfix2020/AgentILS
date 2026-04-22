import { Bubble, type BubbleListProps, type BubbleItemType } from '@ant-design/x'
import { Avatar, Tag, Typography } from 'antd'
import { RobotOutlined, UserOutlined } from '@ant-design/icons'
import { formatTime } from '../utils'
import type { TranscriptViewModel } from '../viewModel'
import { GuidedPromptBubble } from './GuidedPromptBubble'

const { Text } = Typography

export function toBubbleItems(items: TranscriptViewModel[]): BubbleItemType[] {
  return items.map((item): BubbleItemType => {
    if (item.kind === 'chat_message') {
      return {
        key: item.id,
        role: item.role === 'user' ? 'user' : 'ai',
        content: item.content,
        loading: item.state !== 'final' && item.role === 'assistant' && !item.content.trim(),
        footer: (
          <Text type="secondary" style={{ fontSize: 11 }}>
            {formatTime(item.timestamp)}
            {item.state !== 'final' ? <Tag color="processing" style={{ marginLeft: 6, fontSize: 11 }}>输出中</Tag> : null}
          </Text>
        ),
      }
    }
    if (item.kind === 'guided_prompt_card') {
      const capturedInteraction = item.interaction
      return {
        key: item.id,
        role: 'guided',
        content: '',
        contentRender: () => <GuidedPromptBubble interaction={capturedInteraction} />,
      }
    }
    const isTool = item.kind === 'tool_event'
    return {
      key: item.id,
      role: 'system',
      content: item.title + (item.content ? `\n${item.content}` : ''),
      header: (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Tag color={isTool ? 'gold' : 'default'} style={{ marginBottom: 0 }}>{isTool ? '工具事件' : '系统事件'}</Tag>
          <Text type="secondary" style={{ fontSize: 11 }}>{formatTime(item.timestamp)}</Text>
        </div>
      ),
    }
  })
}

export function BubbleRenderer({ items }: { items: BubbleItemType[] }) {
  const roles: BubbleListProps['role'] = {
    user: {
      placement: 'end',
      avatar: <Avatar size={36} icon={<UserOutlined />} style={{ background: '#23408d', flexShrink: 0 }} />,
      variant: 'shadow',
      shape: 'corner',
    },
    ai: {
      placement: 'start',
      avatar: <Avatar size={36} icon={<RobotOutlined />} style={{ background: '#0f766e', flexShrink: 0 }} />,
      variant: 'shadow',
      shape: 'corner',
    },
    guided: {
      placement: 'start',
      variant: 'borderless',
      style: { width: '100%', maxWidth: '100%' },
    },
    system: {
      placement: 'start',
      variant: 'borderless',
      style: { width: '100%', maxWidth: '100%', paddingLeft: 0 },
    },
  }

  return <Bubble.List items={items} role={roles} autoScroll style={{ padding: '8px 0' }} />
}
