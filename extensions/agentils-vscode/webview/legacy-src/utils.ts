import type { AgentILSControlMode, AgentILSSessionMessage } from './types'

/**
 * 标准化内容值为字符串
 */
export function normalizeContent(value: unknown): string {
  if (typeof value === 'string') return value
  if (value == null) return ''
  try { return JSON.stringify(value, null, 2) } catch { return String(value) }
}

/**
 * 格式化时间为 HH:MM:SS
 */
export function formatTime(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/**
 * 格式化时间为完整日期字符串
 */
export function formatDateTime(value: string): string {
  if (!value) return '暂无'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

/**
 * 获取控制模式的文本描述
 */
export function getControlModeText(mode: AgentILSControlMode | undefined): string {
  if (mode === 'alternate') return '替代模式'
  if (mode === 'direct') return '直接模式'
  return '标准模式'
}

/**
 * 获取执行阶段的文本描述
 */
export function getPhaseText(value: string | undefined): string {
  const map: Record<string, string> = {
    collect: '信息收集', confirm_elements: '元素确认', plan: '方案规划',
    approval: '执行审批', execute: '执行中', handoff_prepare: '交接准备',
    verify: '结果验证', done: '已完成', blocked: '已阻塞',
    cancelled: '已取消', failed: '失败',
  }
  return value ? (map[value] ?? '待开始') : '待开始'
}

/**
 * 获取任务状态的文本描述
 */
export function getStatusText(value: string | undefined): string {
  const map: Record<string, string> = {
    active: '进行中', awaiting_user: '等待用户', awaiting_approval: '等待审批',
    completed: '已完成', failed: '失败', cancelled: '已取消',
  }
  return value ? (map[value] ?? '待命') : '待命'
}

/**
 * 获取任务状态对应的标签颜色
 */
export function getStatusTagColor(value: string | undefined): string {
  if (value === 'active') return 'processing'
  if (value === 'completed') return 'success'
  if (value === 'awaiting_user' || value === 'awaiting_approval') return 'warning'
  if (value === 'failed' || value === 'cancelled') return 'error'
  return 'default'
}

/**
 * 获取控制模式告警类型
 */
export function getModeAlertType(mode: AgentILSControlMode | undefined): 'success' | 'warning' | 'error' {
  if (mode === 'direct') return 'error'
  if (mode === 'alternate') return 'warning'
  return 'success'
}

/**
 * 获取控制模式告警信息
 */
export function getModeAlertMessage(mode: AgentILSControlMode | undefined): string {
  if (mode === 'alternate') return '当前任务处于替代模式，优先给出方案、建议和人工确认点。'
  if (mode === 'direct') return '当前任务处于直接模式，AgentILS 可能直接推动执行，请重点关注风险与审批。'
  return '当前任务处于标准模式，按正常节奏推进对话与执行。'
}

/**
 * 获取会话事件的标题
 */
export function getEventTitle(message: AgentILSSessionMessage): string {
  if (message.kind === 'interaction_opened') return '已打开引导问题'
  if (message.kind === 'interaction_resolved') return '已完成引导问题'
  if (message.kind === 'tool_call') return '工具调用'
  if (message.kind === 'tool_result') return '工具结果'
  return '系统状态'
}
