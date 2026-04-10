import { RiskLevel, ToolPolicyDecision, ToolPolicyDecisionSchema } from '../types/index.js'

export interface PolicyContext {
  allowDangerousTools?: boolean
  protectedPaths?: string[]
}

const highRiskPatterns = [/delete/i, /remove/i, /drop/i, /deploy/i, /publish/i]
const mediumRiskPatterns = [/write/i, /edit/i, /patch/i, /migrate/i, /exec/i]

function detectRiskLevel(toolName: string): RiskLevel {
  if (highRiskPatterns.some((pattern) => pattern.test(toolName))) {
    return 'high'
  }
  if (mediumRiskPatterns.some((pattern) => pattern.test(toolName))) {
    return 'medium'
  }
  return 'low'
}

export function evaluateToolPolicy(
  toolName: string,
  targets: string[] = [],
  context: PolicyContext = {},
): ToolPolicyDecision {
  const riskLevel = detectRiskLevel(toolName)
  const reasons: string[] = []
  let allowed = true
  let requiresApproval = riskLevel !== 'low'

  if (riskLevel === 'high' && !context.allowDangerousTools) {
    allowed = false
    reasons.push('High-risk tools are disabled by policy.')
  }

  if (context.protectedPaths?.length) {
    const touchingProtectedPath = targets.some((target) =>
      context.protectedPaths?.some((protectedPath) => target.startsWith(protectedPath)),
    )
    if (touchingProtectedPath) {
      requiresApproval = true
      reasons.push('Target set intersects protected paths.')
    }
  }

  if (allowed && reasons.length === 0) {
    reasons.push(riskLevel === 'low' ? 'Tool allowed without additional approval.' : 'Tool allowed but requires explicit approval.')
  }

  return ToolPolicyDecisionSchema.parse({
    allowed,
    requiresApproval,
    riskLevel,
    reasons,
  })
}
