import { randomUUID } from 'node:crypto'
import { z } from 'zod'

export const agentilsSessionStatuses = ['active', 'finished'] as const
export const AgentILSSessionStatusSchema = z.enum(agentilsSessionStatuses)
export type AgentILSSessionStatus = z.infer<typeof AgentILSSessionStatusSchema>

export const agentilsSessionMessageRoles = ['system', 'user', 'assistant', 'tool'] as const
export const AgentILSSessionMessageRoleSchema = z.enum(agentilsSessionMessageRoles)
export type AgentILSSessionMessageRole = z.infer<typeof AgentILSSessionMessageRoleSchema>

export const agentilsSessionMessageKinds = [
  'text',
  'tool_call',
  'tool_result',
  'interaction_opened',
  'interaction_resolved',
  'status',
] as const
export const AgentILSSessionMessageKindSchema = z.enum(agentilsSessionMessageKinds)
export type AgentILSSessionMessageKind = z.infer<typeof AgentILSSessionMessageKindSchema>

export const agentilsSessionMessageStates = ['pending', 'streaming', 'final'] as const
export const AgentILSSessionMessageStateSchema = z.enum(agentilsSessionMessageStates)
export type AgentILSSessionMessageState = z.infer<typeof AgentILSSessionMessageStateSchema>

export const AgentILSSessionPendingInteractionSchema = z.object({
  requestId: z.string(),
  kind: z.enum(['startTask', 'clarification', 'feedback', 'approval']),
  runId: z.string().nullable().default(null),
  title: z.string(),
  description: z.string(),
  placeholder: z.string().optional(),
  required: z.boolean().default(true),
  options: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
        description: z.string().optional(),
      }),
    )
    .default([]),
  summary: z.string().optional(),
  riskLevel: z.enum(['low', 'medium', 'high']).optional(),
  targets: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  controlMode: z.enum(['normal', 'alternate', 'direct']).optional(),
  draftTitle: z.string().optional(),
  draftGoal: z.string().optional(),
  draftControlMode: z.enum(['normal', 'alternate', 'direct']).optional(),
})
export type AgentILSSessionPendingInteraction = z.infer<typeof AgentILSSessionPendingInteractionSchema>

export const AgentILSSessionMessageSchema = z.object({
  id: z.string(),
  role: AgentILSSessionMessageRoleSchema,
  kind: AgentILSSessionMessageKindSchema,
  content: z.unknown(),
  timestamp: z.string(),
  state: AgentILSSessionMessageStateSchema.default('final'),
})
export type AgentILSSessionMessage = z.infer<typeof AgentILSSessionMessageSchema>

export const AgentILSSessionStateSchema = z.object({
  sessionId: z.string(),
  status: AgentILSSessionStatusSchema.default('active'),
  conversationId: z.string(),
  runId: z.string().nullable().default(null),
  messages: z.array(AgentILSSessionMessageSchema).default([]),
  queuedUserMessageIds: z.array(z.string()).default([]),
  pendingInteraction: AgentILSSessionPendingInteractionSchema.nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type AgentILSSessionState = z.infer<typeof AgentILSSessionStateSchema>

export interface CreateAgentILSSessionStateInput {
  sessionId?: string
  status?: AgentILSSessionStatus
  conversationId: string
  runId?: string | null
  messages?: AgentILSSessionMessage[]
  queuedUserMessageIds?: string[]
  pendingInteraction?: AgentILSSessionPendingInteraction | null
  createdAt?: string
  updatedAt?: string
}

export function createAgentILSSessionState(input: CreateAgentILSSessionStateInput): AgentILSSessionState {
  const now = new Date().toISOString()
  return AgentILSSessionStateSchema.parse({
    sessionId: input.sessionId ?? `session_${randomUUID()}`,
    status: input.status ?? 'active',
    conversationId: input.conversationId,
    runId: input.runId ?? null,
    messages: input.messages ?? [],
    queuedUserMessageIds: input.queuedUserMessageIds ?? [],
    pendingInteraction: input.pendingInteraction ?? null,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  })
}

export interface CreateAgentILSSessionMessageInput {
  id?: string
  role: AgentILSSessionMessageRole
  kind: AgentILSSessionMessageKind
  content: unknown
  timestamp?: string
  state?: AgentILSSessionMessageState
}

export function createAgentILSSessionMessage(input: CreateAgentILSSessionMessageInput): AgentILSSessionMessage {
  return AgentILSSessionMessageSchema.parse({
    id: input.id ?? `message_${randomUUID()}`,
    role: input.role,
    kind: input.kind,
    content: input.content,
    timestamp: input.timestamp ?? new Date().toISOString(),
    state: input.state ?? 'final',
  })
}
