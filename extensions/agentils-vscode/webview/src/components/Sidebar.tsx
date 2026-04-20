import { Button, Card, Drawer, Space, Typography } from 'antd'
import { postMessage } from '../vscode-api'
import type { AgentILSPanelState } from '../types'
import { formatDateTime, getPhaseText, getStatusText, getControlModeText } from '../utils'

const { Text } = Typography

function renderKeyValueList(title: string, items: string[]) {
  return (
    <Card title={title} size="small">
      {items.length > 0
        ? <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {items.map((item, i) => <Text key={`${title}_${i}`} style={{ whiteSpace: 'pre-wrap' }}>{i + 1}. {item}</Text>)}
          </Space>
        : <Text type="secondary">暂无</Text>}
    </Card>
  )
}

export function Sidebar({ state, open, onClose }: { state: AgentILSPanelState; open: boolean; onClose: () => void }) {
  const task = state.snapshot.activeTask
  const latestSummary = state.snapshot.latestSummary
  const session = state.snapshot.session
  return (
    <Drawer title="任务状态" placement="right" width={420} onClose={onClose} open={open} styles={{ body: { background: '#0f1728', padding: 16 } }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card size="small" title="当前任务概览">
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Text><Text strong>标题：</Text>{task?.title ?? '暂无'}</Text>
            <Text><Text strong>目标：</Text>{task?.goal ?? '暂无'}</Text>
            <Text><Text strong>阶段：</Text>{getPhaseText(task?.phase)}</Text>
            <Text><Text strong>状态：</Text>{getStatusText(task?.status)}</Text>
            <Text><Text strong>模式：</Text>{getControlModeText(state.controlMode)}</Text>
            <Text><Text strong>运行 ID：</Text>{task?.runId ?? '暂无'}</Text>
            <Text><Text strong>会话状态：</Text>{session?.status === 'finished' ? '已结束' : '进行中'}</Text>
            <Text><Text strong>创建时间：</Text>{formatDateTime(task?.createdAt ?? '')}</Text>
            <Text><Text strong>更新时间：</Text>{formatDateTime(task?.updatedAt ?? '')}</Text>
          </Space>
        </Card>
        {renderKeyValueList('风险', task?.risks ?? [])}
        {renderKeyValueList('开放问题', task?.openQuestions ?? [])}
        {renderKeyValueList('假设', task?.assumptions ?? [])}
        {renderKeyValueList('范围', task?.scope ?? [])}
        {renderKeyValueList('约束', task?.constraints ?? [])}
        {renderKeyValueList('需要用户决策', task?.decisionNeededFromUser ?? [])}
        {renderKeyValueList('备注', task?.notes ?? [])}
        <Card size="small" title="摘要文档" extra={<Button size="small" onClick={() => postMessage({ action: 'openSummary' })}>打开</Button>}>
          <Text type="secondary">{latestSummary?.filePath ?? task?.summaryDocument?.filePath ?? '暂无摘要文档'}</Text>
        </Card>
      </Space>
    </Drawer>
  )
}
