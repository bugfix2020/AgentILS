import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { TaskTimelineEntrySchema } from './task.js'

export const sessionStatuses = ['active', 'closed'] as const
export const SessionStatusSchema = z.enum(sessionStatuses)
export type SessionStatus = z.infer<typeof SessionStatusSchema>

export const AgentILSSessionStateSchema = z.object({
  sessionId: z.string(),
  status: SessionStatusSchema.default('active'),
  activeTaskId: z.string().nullable().default(null),
  taskIds: z.array(z.string()).default([]),
  timeline: z.array(TaskTimelineEntrySchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type AgentILSSessionState = z.infer<typeof AgentILSSessionStateSchema>

export function createSession(now = new Date().toISOString()): AgentILSSessionState {
  return AgentILSSessionStateSchema.parse({
    sessionId: `session_${randomUUID()}`,
    status: 'active',
    activeTaskId: null,
    taskIds: [],
    timeline: [],
    createdAt: now,
    updatedAt: now,
  })
}
