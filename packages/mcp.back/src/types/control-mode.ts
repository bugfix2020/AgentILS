import { z } from 'zod'

export const controlModes = ['normal', 'alternate', 'direct'] as const
export const ControlModeSchema = z.enum(controlModes)

export type ControlMode = z.infer<typeof ControlModeSchema>
