import { normalizeControlMode } from './control-modes.js'
import {
  createOverrideState as createCanonicalOverrideState,
  type CreateOverrideStateInput,
  type OverrideLevel,
  type OverrideState,
} from '../types/control-mode.js'

export type { CreateOverrideStateInput, OverrideLevel, OverrideState }

export function createOverrideState(input: CreateOverrideStateInput): OverrideState {
  return createCanonicalOverrideState({
    ...input,
    mode: normalizeControlMode(input.mode ?? null),
  })
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
