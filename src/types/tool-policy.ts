// src/types/tool-policy.ts

export type ToolRiskLevel = 'low' | 'medium' | 'high'

export type ToolPolicy = {
  toolName: string
  riskLevel: ToolRiskLevel
  requiresApproval: boolean
  requiresVerifiedEmail: boolean
  requiresAllowlistedEmail: boolean
  allowedAgents?: string[]
  allowedPromptFiles?: string[]
}
