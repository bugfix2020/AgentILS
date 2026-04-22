import { Bubble } from '@ant-design/x'
import { Card, Typography } from 'antd'
import type { WebviewViewModel } from '../protocol'

function getBubbleRole(role: string, kind: string) {
  if (kind === 'status' || kind === 'interaction_opened' || kind === 'interaction_resolved') {
    return 'system'
  }
  if (role === 'assistant' || role === 'tool') {
    return 'ai'
  }
  if (role === 'user') {
    return 'user'
  }
  return 'system'
}

export function TimelineList({ timeline }: { timeline: WebviewViewModel['timeline'] }) {
  const items = timeline.map((item) => ({
    key: item.id,
    role: getBubbleRole(item.role, item.kind),
    content: item.content,
    header: `${item.role} · ${item.kind}`,
  }))

  return (
    <Card bordered={false} className="surface-card timeline-card">
      <div className="surface-card-header">
        <p className="section-kicker">Timeline</p>
        <Typography.Title level={3}>Recent events</Typography.Title>
      </div>
      {timeline.length === 0 ? <p className="body-copy muted">No events yet.</p> : null}
      {timeline.length > 0 ? (
        <Bubble.List
          items={items}
          autoScroll
          className="timeline-list"
          style={{ height: 560 }}
          roles={{
            ai: {
              placement: 'start',
              variant: 'filled',
            },
            user: {
              placement: 'end',
              variant: 'outlined',
            },
            system: {
              variant: 'borderless',
            },
          }}
        />
      ) : null}
    </Card>
  )
}
