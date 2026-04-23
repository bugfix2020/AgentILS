import { z } from 'zod'

export const hookDecisionKinds = ['allow', 'block'] as const

export const HookDecisionSchema = z.object({
  decision: z.enum(hookDecisionKinds),
  reason: z.string().optional(),
  runId: z.string().optional(),
  taskId: z.string().optional(),
  conversationId: z.string().optional(),
  toolName: z.string().optional(),
  details: z.record(z.unknown()).optional(),
})

export type HookDecision = z.infer<typeof HookDecisionSchema>

export const HookEventSchema = z.object({
  kind: z.string(),
  runId: z.string().optional(),
  taskId: z.string().optional(),
  conversationId: z.string().optional(),
  toolName: z.string().optional(),
  payload: z.record(z.unknown()).default({}),
  decision: HookDecisionSchema.optional(),
})

export type HookEvent = z.infer<typeof HookEventSchema>
