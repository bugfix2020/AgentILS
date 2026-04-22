import { Avatar, Typography } from 'antd'
import { CheckCircleOutlined, RobotOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { Welcome, Prompts } from '@ant-design/x'
import type { PromptsItemType } from '@ant-design/x'

const SUGGESTED_PROMPTS: PromptsItemType[] = [
  { key: 'start', icon: <ThunderboltOutlined style={{ color: '#66d3a7' }} />, label: '开始新任务', description: '告诉 AgentILS 你想完成什么目标' },
  { key: 'status', icon: <CheckCircleOutlined style={{ color: '#60a5fa' }} />, label: '查看当前状态', description: '了解当前任务的进展与风险' },
]

export function WelcomeScreen({ onPromptClick }: { onPromptClick: (text: string) => void }) {
  return (
    <div style={{ padding: '40px 0 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
      <Welcome
        variant="borderless"
        icon={<Avatar size={64} icon={<RobotOutlined />} style={{ background: 'linear-gradient(135deg, #0f766e 0%, #0369a1 100%)', boxShadow: '0 8px 24px rgba(15,118,110,0.4)' }} />}
        title="你好，我是 AgentILS"
        description="当前 webview 对应一次 Copilot 对话。你可以直接发送指令，AgentILS 将引导你完成任务。"
        style={{ textAlign: 'center', maxWidth: 560 }}
      />
      <Prompts
        items={SUGGESTED_PROMPTS}
        onItemClick={({ data }) => onPromptClick(data.label as string)}
        wrap
        style={{ maxWidth: 560, width: '100%' }}
      />
    </div>
  )
}
