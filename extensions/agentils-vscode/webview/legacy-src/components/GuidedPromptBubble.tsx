import { Alert, Button, Card, Form, Input, Space, Tag, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { postMessage } from '../vscode-api'
import { logger } from '../logger'
import type { AgentILSControlMode, AgentILSPendingInteraction } from '../types'
import { getControlModeText } from '../utils'

const { Text, Paragraph } = Typography

interface GuidedCardValues {
  branch?: string
  title?: string
  goal?: string
  controlMode?: AgentILSControlMode
  content?: string
  status?: string
  message?: string
}

export function GuidedPromptBubble({ interaction }: { interaction: AgentILSPendingInteraction }) {
  const [form] = Form.useForm<GuidedCardValues>()
  const [branch, setBranch] = useState<string>()
  const [selectedMode, setSelectedMode] = useState<AgentILSControlMode>(interaction.draftControlMode ?? 'normal')

  useEffect(() => {
    const initialBranch =
      interaction.kind === 'startTask' ? 'direct'
      : interaction.kind === 'clarification' ? 'answer'
      : interaction.kind === 'feedback' ? (interaction.options?.[0]?.value ?? 'continue')
      : 'accept'
    setBranch(initialBranch)
    setSelectedMode(interaction.draftControlMode ?? 'normal')
    form.setFieldsValue({ branch: initialBranch, title: interaction.draftTitle, goal: interaction.draftGoal, controlMode: interaction.draftControlMode ?? 'normal', status: interaction.options?.[0]?.value as GuidedCardValues['status'] })
  }, [form, interaction])

  const onFinish = (values: GuidedCardValues) => {
    logger.info('GuidedPromptBubble', 'interaction_submitted', { kind: interaction.kind, branch: values.branch })
    if (interaction.kind === 'startTask') {
      if (values.branch === 'direct') {
        postMessage({ action: 'submitPendingInteraction', requestId: interaction.requestId, title: interaction.draftTitle, goal: interaction.draftGoal, controlMode: interaction.draftControlMode ?? 'normal' })
      } else {
        postMessage({ action: 'submitPendingInteraction', requestId: interaction.requestId, title: values.title, goal: values.goal, controlMode: values.controlMode })
      }
      return
    }
    if (interaction.kind === 'clarification') {
      if (values.branch === 'skip') {
        postMessage({ action: 'cancelPendingInteraction', requestId: interaction.requestId })
      } else {
        postMessage({ action: 'submitPendingInteraction', requestId: interaction.requestId, content: values.content })
      }
      return
    }
    if (interaction.kind === 'feedback') {
      if (values.branch === 'cancel') {
        postMessage({ action: 'cancelPendingInteraction', requestId: interaction.requestId })
      } else {
        postMessage({ action: 'submitPendingInteraction', requestId: interaction.requestId, status: values.branch, message: values.message })
      }
      return
    }
    if (values.branch === 'cancel') {
      postMessage({ action: 'cancelPendingInteraction', requestId: interaction.requestId })
    } else {
      postMessage({ action: 'submitPendingInteraction', requestId: interaction.requestId, responseAction: values.branch, status: values.branch === 'accept' ? 'continue' : 'cancel', message: values.message })
    }
  }

  const branchOptions =
    interaction.kind === 'startTask' ? [{ label: '沿用建议', value: 'direct' }, { label: '手动调整', value: 'refine' }]
    : interaction.kind === 'clarification' ? [{ label: '直接回答', value: 'answer' }, { label: '暂时跳过', value: 'skip' }]
    : interaction.kind === 'feedback' ? [{ label: '继续', value: 'continue' }, { label: '完成', value: 'done' }, { label: '修订', value: 'revise' }, { label: '取消', value: 'cancel' }]
    : [{ label: '确认执行', value: 'accept' }, { label: '返回修改', value: 'decline' }, { label: '取消', value: 'cancel' }]

  return (
    <Card
      size="small"
      style={{ background: 'linear-gradient(180deg, rgba(25,34,55,0.98), rgba(16,22,38,0.98))', borderColor: '#2e3d61', width: '100%' }}
      title={<Text strong style={{ color: '#f3f7ff' }}>需要你的处理</Text>}
      extra={<Tag color="gold">{interaction.kind}</Tag>}
    >
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Text strong style={{ color: '#f3f7ff' }}>{interaction.title}</Text>
          <Paragraph style={{ marginBottom: 0, color: '#aeb7cb', whiteSpace: 'pre-wrap' }}>{interaction.description}</Paragraph>
        </Space>
        <Form<GuidedCardValues> form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item label="请选择当前路径" name="branch">
            <Input type="hidden" />
            <Space wrap>
              {branchOptions.map((option) => (
                <Button key={option.value} type={branch === option.value ? 'primary' : 'default'} onClick={() => { setBranch(option.value); form.setFieldValue('branch', option.value) }}>
                  {option.label}
                </Button>
              ))}
            </Space>
          </Form.Item>
          {interaction.kind === 'startTask' && branch === 'refine' ? (
            <>
              <Form.Item label="任务标题" name="title" rules={[{ required: true, message: '请输入任务标题' }]}><Input placeholder="例如：事故分析" /></Form.Item>
              <Form.Item label="任务目标" name="goal" rules={[{ required: true, message: '请输入任务目标' }]}><Input.TextArea rows={4} placeholder="请描述希望 AgentILS 完成的目标" /></Form.Item>
              <Form.Item label="控制模式" name="controlMode">
                <Input type="hidden" />
                <Space wrap>
                  {(['normal', 'alternate', 'direct'] as const).map((mode) => (
                    <Button key={mode} type={selectedMode === mode ? 'primary' : 'default'} onClick={() => { setSelectedMode(mode); form.setFieldValue('controlMode', mode) }}>
                      {getControlModeText(mode)}
                    </Button>
                  ))}
                </Space>
              </Form.Item>
            </>
          ) : null}
          {interaction.kind === 'clarification' && branch === 'answer' ? (
            <Form.Item label="你的补充说明" name="content" rules={interaction.required ? [{ required: true, message: '请先补充说明' }] : undefined}>
              <Input.TextArea rows={4} placeholder={interaction.placeholder ?? '请输入补充信息'} />
            </Form.Item>
          ) : null}
          {interaction.kind === 'feedback' && branch !== 'cancel' ? (
            <Form.Item label="补充说明" name="message"><Input.TextArea rows={3} placeholder="可选：补充你的判断、原因或下一步意见" /></Form.Item>
          ) : null}
          {interaction.kind === 'approval' && branch !== 'cancel' ? (
            <>
              <Alert type={interaction.riskLevel === 'high' ? 'error' : interaction.riskLevel === 'medium' ? 'warning' : 'info'} showIcon message={interaction.summary ?? '当前操作需要用户决策'} />
              <Form.Item label={branch === 'decline' ? '返回修改原因' : '确认备注'} name="message">
                <Input.TextArea rows={3} placeholder={branch === 'decline' ? '请说明为什么需要返回修改' : '可选：补充确认执行的备注'} />
              </Form.Item>
            </>
          ) : null}
          <Space>
            <Button type="primary" htmlType="submit">{branch === 'cancel' || branch === 'skip' ? '确认取消' : '继续'}</Button>
            <Button onClick={() => postMessage({ action: 'cancelPendingInteraction', requestId: interaction.requestId })}>返回上一步</Button>
          </Space>
        </Form>
      </Space>
    </Card>
  )
}
