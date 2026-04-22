import { RobotOutlined } from '@ant-design/icons'
import { Avatar, Card, Flex, Tag, Typography } from 'antd'
import type { WebviewViewModel } from '../protocol'

export function TaskStatusHeader({
  task,
  sessionStatus,
}: {
  task: WebviewViewModel['task']
  sessionStatus: WebviewViewModel['session']['status']
}) {
  return (
    <Card bordered={false} className="status-header">
      <Flex justify="space-between" align="flex-start" gap={24} wrap>
        <Flex gap={16} align="flex-start" className="status-hero">
          <Avatar size={56} icon={<RobotOutlined />} className="status-avatar" />
          <div>
            <p className="eyebrow">AgentILS V1 Loop</p>
            <Typography.Title level={1} className="status-title">
              {task.title}
            </Typography.Title>
            <Typography.Paragraph className="hero-copy">
              WebView 只负责展示和收集输入，状态推进始终回到 runTaskLoop。
            </Typography.Paragraph>
          </div>
        </Flex>
        <Flex className="status-badges" gap={10} wrap>
          <Tag className="badge">phase {task.phase}</Tag>
          <Tag className="badge">mode {task.controlMode}</Tag>
          <Tag className="badge">terminal {task.terminal}</Tag>
          <Tag className="badge">session {sessionStatus}</Tag>
        </Flex>
      </Flex>
    </Card>
  )
}
