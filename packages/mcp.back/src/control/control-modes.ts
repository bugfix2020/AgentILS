export const controlModes = ['normal', 'alternate', 'direct'] as const

export type ControlMode = (typeof controlModes)[number]

export const controlModeOrder: ControlMode[] = ['normal', 'alternate', 'direct']

export function isControlMode(value: unknown): value is ControlMode {
  return typeof value === 'string' && (controlModes as readonly string[]).includes(value)
}

export function normalizeControlMode(value?: string | null): ControlMode {
  return isControlMode(value) ? value : 'normal'
}

export function isDegradedControlMode(mode: ControlMode): boolean {
  return mode !== 'normal'
}

export function degradeControlMode(mode: ControlMode): ControlMode {
  if (mode === 'normal') {
    return 'alternate'
  }
  return 'direct'
}

export function upgradeControlMode(mode: ControlMode): ControlMode {
  if (mode === 'direct') {
    return 'alternate'
  }
  return 'normal'
}

