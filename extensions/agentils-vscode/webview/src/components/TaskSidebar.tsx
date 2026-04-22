import { AppstoreAddOutlined, FieldTimeOutlined, FolderOpenOutlined, MessageOutlined } from '@ant-design/icons'
import { Conversations } from '@ant-design/x'
import { Button, Card, Space, Tag, Typography } from 'antd'
import type { WebviewViewModel } from '../protocol'

function getTaskTag(task: WebviewViewModel['tasks'][number]) {
  if (task.archived) {
    return <Tag color="default">已归档</Tag>
  }

  if (task.terminal !== 'active') {
    return <Tag color="processing">{task.terminal}</Tag>
  }

  return <Tag color="success">{task.phase}</Tag>
}

export function TaskSidebar({
  tasks,
  onStartNewTask,
}: {
  tasks: WebviewViewModel['tasks']
  onStartNewTask: () => void
}) {
  const activeTasks = tasks.filter((task) => !task.archived)
  const archivedTasks = tasks.filter((task) => task.archived)
  const items = [
    ...activeTasks.map((task) => ({
      key: task.taskId,
      label: task.title,
      group: '当前任务',
      icon: <MessageOutlined />,
      disabled: false,
    })),
    ...archivedTasks.map((task) => ({
      key: task.taskId,
      label: task.title,
      group: '归档任务',
      icon: <FieldTimeOutlined />,
      disabled: true,
    })),
  ]

  return (
    <aside className="task-sidebar">
      <Card bordered={false} className="sidebar-brand-card">
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <div className="sidebar-brand">
            <div className="sidebar-logo">AX</div>
            <div>
              <Typography.Title level={4} className="sidebar-brand-title">
                AgentILS
              </Typography.Title>
              <Typography.Paragraph className="sidebar-brand-subtitle">
                Independent Workspace
              </Typography.Paragraph>
            </div>
          </div>

          <Button type="primary" icon={<AppstoreAddOutlined />} block size="large" className="new-task-button" onClick={onStartNewTask}>
            新任务
          </Button>
        </Space>
      </Card>

      <Card bordered={false} className="sidebar-conversations-card">
        <Conversations
          rootClassName="task-conversations"
          items={items}
          activeKey={activeTasks[0]?.taskId}
          groupable={{
            label: (group) => group,
          }}
          onActiveChange={() => undefined}
        />
      </Card>

      <div className="sidebar-section">
        {activeTasks.length === 0 ? <p className="sidebar-empty">当前没有激活任务</p> : null}
        {activeTasks.map((task) => (
          <Card key={task.taskId} bordered={false} className="task-item task-item-active">
            <div className="task-item-row">
              <div>
                <p className="task-item-title">{task.title}</p>
                <p className="task-item-subtitle">模式 {task.controlMode}</p>
              </div>
              <div className="task-item-tag">{getTaskTag(task)}</div>
            </div>
          </Card>
        ))}

        {archivedTasks.map((task) => (
          <Card key={task.taskId} bordered={false} className="task-item task-item-archived">
            <div className="task-item-row">
              <div>
                <p className="task-item-title">{task.title}</p>
                <p className="task-item-subtitle">已封存，不可继续对话</p>
              </div>
              <Space size={6}>
                <FolderOpenOutlined className="task-archive-icon" />
                <div className="task-item-tag">{getTaskTag(task)}</div>
              </Space>
            </div>
          </Card>
        ))}
      </div>
    </aside>
  )
}
