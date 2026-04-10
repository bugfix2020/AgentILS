import { normalizeControlMode, type ControlMode } from './control-modes.js'

export type OverrideLevel = 'soft' | 'hard'

export interface OverrideState {
  confirmed: boolean
  level: OverrideLevel
  summary: string
  acceptedRisks: string[]
  skippedChecks: string[]
  confirmedAt: string
  taskId?: string
  conversationId?: string
  mode: ControlMode
}

export interface CreateOverrideStateInput {
  summary: string
  acceptedRisks?: string[]
  skippedChecks?: string[]
  taskId?: string
  conversationId?: string
  mode?: ControlMode | string | null
  level?: OverrideLevel
  confirmed?: boolean
  confirmedAt?: string
}

export function createOverrideState(input: CreateOverrideStateInput): OverrideState {
  return {
    confirmed: input.confirmed ?? true,
    level: input.level ?? 'soft',
    summary: input.summary,
    acceptedRisks: [...(input.acceptedRisks ?? [])],
    skippedChecks: [...(input.skippedChecks ?? [])],
    confirmedAt: input.confirmedAt ?? new Date().toISOString(),
    taskId: input.taskId,
    conversationId: input.conversationId,
    mode: normalizeControlMode(input.mode ?? null),
  }
}

export function isOverrideActive(overrideState?: OverrideState | null): boolean {
  return Boolean(overrideState?.confirmed)
}

export function isHardOverride(overrideState?: OverrideState | null): boolean {
  return overrideState?.level === 'hard'
}

export function summarizeOverride(overrideState?: OverrideState | null): string {
  if (!overrideState) {
    return 'No override'
  }

  const risks = overrideState.acceptedRisks.length > 0 ? overrideState.acceptedRisks.join('; ') : 'none'
  return `${overrideState.level} override: ${overrideState.summary} [risks: ${risks}]`
}

