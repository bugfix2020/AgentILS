import { Avatar, Button, Space, Tag, Typography } from 'antd'
import { CheckCircleOutlined, RobotOutlined, SettingOutlined } from '@ant-design/icons'
import type { AgentILSControlMode } from '../types'
import { getControlModeText, getPhaseText, getStatusTagColor } from '../utils'

const { Text } = Typography

export function HeaderBar({
  taskTitle, taskPhase, taskStatus, controlMode, sessionActive, onOpenSidebar,
}: {
  taskTitle?: string; taskPhase?: string; taskStatus?: string
  controlMode?: AgentILSControlMode; sessionActive: boolean; onOpenSidebar: () => void
}) {
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 100, backdropFilter: 'blur(16px)', background: 'rgba(7,11,19,0.85)', borderBottom: '1px solid rgba(43,56,84,0.7)' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Space size={8} align="center">
          <Avatar size={32} icon={<RobotOutlined />} style={{ background: 'linear-gradient(135deg, #0f766e, #0369a1)', flexShrink: 0 }} />
          <Space direction="vertical" size={0}>
            <Text strong style={{ color: '#f3f7ff', fontSize: 14, lineHeight: '20px' }}>{taskTitle ?? 'AgentILS'}</Text>
            <Space size={4}>
              <Tag color={controlMode === 'direct' ? 'red' : controlMode === 'alternate' ? 'gold' : 'cyan'} style={{ fontSize: 11, lineHeight: '16px', marginInlineEnd: 0 }}>{getControlModeText(controlMode)}</Tag>
              <Tag color={getStatusTagColor(taskStatus)} style={{ fontSize: 11, lineHeight: '16px', marginInlineEnd: 0 }}>{getPhaseText(taskPhase)}</Tag>
              {sessionActive
                ? <Tag color="success" icon={<CheckCircleOutlined />} style={{ fontSize: 11, lineHeight: '16px', marginInlineEnd: 0 }}>会话进行中</Tag>
                : <Tag color="default" style={{ fontSize: 11, lineHeight: '16px', marginInlineEnd: 0 }}>会话已结束</Tag>}
            </Space>
          </Space>
        </Space>
        <Button size="small" icon={<SettingOutlined />} onClick={onOpenSidebar}>查看状态</Button>
      </div>
    </div>
  )
}
