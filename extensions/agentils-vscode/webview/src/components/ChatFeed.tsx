import { Bubble } from '@ant-design/x'
import type { InteractionActionId, WebviewViewModel } from '../protocol'
import { TaskSummaryContent } from './TaskSummaryCard'
import { InteractionContent } from './InteractionCard'

function getBubbleRole(role: string, kind: string) {
  if (kind === 'status' || kind === 'interaction_opened' || kind === 'interaction_resolved') return 'system'
  if (role === 'assistant' || role === 'tool') return 'ai'
  if (role === 'user') return 'user'
  return 'system'
}

export function ChatFeed({
  timeline,
  content,
  interaction,
  busy,
  placeholder,
  onSubmitInteraction,
}: {
  timeline: WebviewViewModel['timeline']
  content: WebviewViewModel['content']
  interaction: WebviewViewModel['interaction']
  busy: boolean
  placeholder: string
  onSubmitInteraction: (actionId?: InteractionActionId, message?: string) => void
}) {
  const items = timeline.map((item) => ({
    key: item.id,
    role: getBubbleRole(item.role, item.kind),
    content: <pre className="timeline-content-pre">{item.content}</pre>,
    header: `${item.role} · ${item.kind}`,
  }))

  items.push({
    key: '__summary',
    role: 'ai',
    content: <TaskSummaryContent content={content} />,
    header: 'AI · Task Projection',
  })

  if (interaction.exists) {
    items.push({
      key: '__interaction',
      role: 'system',
      content: (
        <InteractionContent
          interaction={interaction}
          busy={busy}
          placeholder={placeholder}
          onSubmit={onSubmitInteraction}
        />
      ),
      header: `System · Action Required`,
    })
  }

  return (
    <div className="chat-feed-container">
      <Bubble.List
        items={items}
        autoScroll
        className="chat-bubble-list"
        roles={{
          ai: { placement: 'start', variant: 'filled' },
          user: { placement: 'end', variant: 'outlined' },
          system: { variant: 'borderless' },
        }}
      />
    </div>
  )
}