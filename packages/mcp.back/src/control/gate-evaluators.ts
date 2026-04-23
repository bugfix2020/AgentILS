import {
  type HandoffPacket,
  type RunRecord,
  type TaskCard,
  type VerificationStatus,
} from '../types/index.js'
import { isOverrideActive, type OverrideState } from './override-policy.js'
import { normalizeControlMode, type ControlMode } from './control-modes.js'

export interface TaskReadiness {
  technicallyReady: boolean
  boundaryApproved: boolean
  policyAllowed: boolean
  missingInfo: string[]
  risks: string[]
}

export interface GateDecision {
  allowed: boolean
  reasons: string[]
  controlMode: ControlMode
}

export interface TaskExecutionGateInput {
  taskCard: Pick<
    TaskCard,
    'goal' | 'scope' | 'steps' | 'risks' | 'verificationRequirements' | 'controlMode' | 'currentStep' | 'currentStatus'
  >
  policyAllowed: boolean
  boundaryApproved: boolean
  approvalPassed?: boolean
  overrideState?: OverrideState | null
  controlMode?: ControlMode | string | null
}

export function evaluateTaskReadiness(input: TaskExecutionGateInput): TaskReadiness {
  const missingInfo: string[] = []
  const risks = [...input.taskCard.risks]

  if (!input.taskCard.goal.trim()) {
    missingInfo.push('task goal')
  }
  if (input.taskCard.steps.length === 0) {
    missingInfo.push('task steps')
  }
  if (input.taskCard.verificationRequirements.length === 0) {
    missingInfo.push('verification requirements')
  }

  const technicallyReady = missingInfo.length === 0 || isOverrideActive(input.overrideState)
  const boundaryApproved = input.boundaryApproved || isOverrideActive(input.overrideState)
  const policyAllowed = input.policyAllowed

  return {
    technicallyReady,
    boundaryApproved,
    policyAllowed,
    missingInfo,
    risks,
  }
}

export function evaluateTaskExecutionGate(input: TaskExecutionGateInput): GateDecision {
  const readiness = evaluateTaskReadiness(input)
  const reasons: string[] = []
  const controlMode = normalizeControlMode(input.controlMode ?? input.taskCard.controlMode)

  if (!readiness.technicallyReady) {
    reasons.push(`Missing info: ${readiness.missingInfo.join(', ')}`)
  }
  if (!readiness.boundaryApproved) {
    reasons.push('Boundary is not approved.')
  }
  if (!readiness.policyAllowed) {
    reasons.push('Policy gate disallows execution.')
  }
  if (controlMode !== 'direct' && !input.approvalPassed) {
    reasons.push('Approval has not been granted.')
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    controlMode,
  }
}

export function evaluateTaskStopGate(run: RunRecord): GateDecision {
  const reasons: string[] = []

  if (!run.userConfirmedDone) {
    reasons.push('User has not confirmed completion.')
  }
  if (!run.verifyPassed) {
    reasons.push('Verification has not passed.')
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    controlMode: normalizeControlMode(run.controlMode),
  }
}

export function evaluateConversationStopGate(
  run: RunRecord,
  taskDone: boolean,
  explicitConversationEnd: boolean,
): GateDecision {
  const reasons: string[] = []

  if (!taskDone) {
    reasons.push('Current task is not done.')
  }
  if (!explicitConversationEnd) {
    reasons.push('Conversation end was not explicitly requested.')
  }
  if (!run.verifyPassed) {
    reasons.push('Task verification is not complete.')
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    controlMode: normalizeControlMode(run.controlMode),
  }
}

export function evaluateVerificationGate(run: RunRecord, handoff: HandoffPacket): GateDecision {
  const reasons: string[] = []

  if (!run.userConfirmedDone) {
    reasons.push('User has not confirmed done.')
  }
  if (!handoff.nextRecommendedAction.trim()) {
    reasons.push('Handoff is missing nextRecommendedAction.')
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    controlMode: normalizeControlMode(run.controlMode),
  }
}
