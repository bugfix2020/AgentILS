import { z } from 'zod'

export const controlModes = ['normal', 'alternate', 'direct'] as const
export const overrideLevels = ['soft', 'hard'] as const
export const overrideRequesters = ['user'] as const

export const ControlModeSchema = z.enum(controlModes)
export const OverrideLevelSchema = z.enum(overrideLevels)
export const OverrideRequesterSchema = z.enum(overrideRequesters)

export type ControlMode = z.infer<typeof ControlModeSchema>
export type OverrideLevel = z.infer<typeof OverrideLevelSchema>
export type OverrideRequester = z.infer<typeof OverrideRequesterSchema>

export const OverrideStateSchema = z.object({
  confirmed: z.boolean().default(true),
  taskId: z.string(),
  conversationId: z.string().nullable().default(null),
  level: OverrideLevelSchema,
  summary: z.string(),
  acceptedRisks: z.array(z.string()).default([]),
  skippedChecks: z.array(z.string()).default([]),
  requestedBy: OverrideRequesterSchema.default('user'),
  confirmedAt: z.string(),
  mode: ControlModeSchema,
})

export type OverrideState = z.infer<typeof OverrideStateSchema>

export interface CreateOverrideStateInput {
  confirmed?: boolean
  taskId: string
  level: OverrideLevel
  summary: string
  acceptedRisks?: string[]
  skippedChecks?: string[]
  requestedBy?: OverrideRequester
  confirmedAt?: string
  conversationId?: string | null
  mode?: ControlMode | string | null
}

export function createOverrideState(input: CreateOverrideStateInput): OverrideState {
  return OverrideStateSchema.parse({
    confirmed: input.confirmed ?? true,
    taskId: input.taskId,
    conversationId: input.conversationId ?? null,
    level: input.level,
    summary: input.summary,
    acceptedRisks: input.acceptedRisks ?? [],
    skippedChecks: input.skippedChecks ?? [],
    requestedBy: input.requestedBy ?? 'user',
    confirmedAt: input.confirmedAt ?? new Date().toISOString(),
    mode: input.mode ?? 'normal',
  })
}
