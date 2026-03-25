// src/policy/tool-policy-checker.ts

import type { ToolPolicy } from '../types/tool-policy.js'
import type { AccessPolicy } from '../types/access-policy.js'

export type PolicyCheckContext = {
  userEmail?: string
  emailVerified: boolean
  isAllowlisted: boolean
  isLoggedIn: boolean
  agentName?: string
  promptFile?: string
}

export type PolicyCheckResult =
  | { ok: true }
  | { ok: false; reason: string }

/**
 * 检查当前上下文是否允许调用指定工具。
 */
export function checkToolPolicy(
  toolName: string,
  policy: ToolPolicy | undefined,
  accessPolicy: AccessPolicy,
  ctx: PolicyCheckContext
): PolicyCheckResult {
  // 工具被全局封禁
  if (accessPolicy.blockedTools.includes(toolName)) {
    return { ok: false, reason: 'TOOL_BLOCKED' }
  }

  // 无策略定义，默认放行
  if (!policy) {
    return { ok: true }
  }

  // 需要已验证邮箱
  if (policy.requiresVerifiedEmail && !ctx.emailVerified) {
    return { ok: false, reason: 'REQUIRE_VERIFIED_EMAIL' }
  }

  // 需要白名单邮箱
  if (policy.requiresAllowlistedEmail && !ctx.isAllowlisted) {
    return { ok: false, reason: 'EMAIL_NOT_ALLOWED' }
  }

  // 需要审批（高风险工具）
  if (policy.requiresApproval) {
    // 此处返回需要审批标记；实际审批由 approval tool 在运行时处理
    // 这里只做前置拦截：如果未登录，高风险工具不可用
    if (!ctx.isLoggedIn) {
      return { ok: false, reason: 'REQUIRE_LOGIN_FOR_HIGH_RISK' }
    }
  }

  // Agent 限制
  if (policy.allowedAgents && policy.allowedAgents.length > 0) {
    if (!ctx.agentName || !policy.allowedAgents.includes(ctx.agentName)) {
      return { ok: false, reason: 'AGENT_NOT_ALLOWED' }
    }
  }

  // Prompt file 限制
  if (policy.allowedPromptFiles && policy.allowedPromptFiles.length > 0) {
    if (!ctx.promptFile || !policy.allowedPromptFiles.includes(ctx.promptFile)) {
      return { ok: false, reason: 'PROMPT_FILE_NOT_ALLOWED' }
    }
  }

  return { ok: true }
}

/**
 * 检查邮箱是否匹配白名单策略。
 */
export function isEmailAllowlisted(
  email: string | undefined,
  accessPolicy: AccessPolicy
): boolean {
  if (!email) return false

  // 无白名单配置 = 全部放行
  if (accessPolicy.allowedEmails.length === 0 && accessPolicy.allowedDomains.length === 0) {
    return true
  }

  // 精确邮箱匹配
  if (accessPolicy.allowedEmails.includes(email)) {
    return true
  }

  // 域名匹配
  const domain = email.split('@')[1]
  if (domain && accessPolicy.allowedDomains.includes(domain)) {
    return true
  }

  return false
}
