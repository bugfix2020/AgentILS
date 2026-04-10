import { degradeControlMode, normalizeControlMode, upgradeControlMode, type ControlMode } from './control-modes.js'
import { type OverrideState } from './override-policy.js'

export type ControlModeSignal = 'stable' | 'override' | 'repeat_override' | 'recovery'

export function nextControlMode(
  currentMode: ControlMode | string | null | undefined,
  signal: ControlModeSignal = 'stable',
  overrideState?: OverrideState | null,
): ControlMode {
  const normalized = normalizeControlMode(currentMode ?? null)

  if (signal === 'repeat_override') {
    return normalized === 'normal' ? 'alternate' : 'direct'
  }

  if (signal === 'override') {
    if (overrideState?.level === 'hard' || normalized !== 'normal') {
      return 'alternate'
    }
    return degradeControlMode(normalized)
  }

  if (signal === 'recovery') {
    return upgradeControlMode(normalized)
  }

  return normalized
}

export function shouldUseAlternateMode(
  normalLoopConverged: boolean,
  overrideState?: OverrideState | null,
): boolean {
  return !normalLoopConverged || Boolean(overrideState?.confirmed)
}

export function shouldUseDirectMode(
  repeatOverrideCount: number,
  overrideState?: OverrideState | null,
): boolean {
  return repeatOverrideCount > 1 || overrideState?.level === 'hard'
}

