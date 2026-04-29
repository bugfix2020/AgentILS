import { z } from 'zod'
import { TaskSummaryDocumentSchema, type TaskSummaryDocument } from '../summary/summary-schema.js'

export const conversationStates = [
  'active_task',
  'await_next_task',
  'conversation_blocked',
  'conversation_done',
] as const

export const ConversationStateSchema = z.enum(conversationStates)

export type ConversationState = z.infer<typeof ConversationStateSchema>

export const ConversationRecordSchema = z.object({
  conversationId: z.string(),
  state: ConversationStateSchema,
  activeTaskId: z.string().nullable().default(null),
  completedTaskIds: z.array(z.string()).default([]),
  archivedTaskSummaries: z.array(TaskSummaryDocumentSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type ConversationRecord = z.infer<typeof ConversationRecordSchema>

export interface CreateConversationRecordInput {
  conversationId: string
  state?: ConversationState
  activeTaskId?: string | null
  completedTaskIds?: string[]
  archivedTaskSummaries?: TaskSummaryDocument[]
  createdAt?: string
  updatedAt?: string
}

export function createConversationRecord(input: CreateConversationRecordInput): ConversationRecord {
  const now = new Date().toISOString()
  return ConversationRecordSchema.parse({
    conversationId: input.conversationId,
    state: input.state ?? 'await_next_task',
    activeTaskId: input.activeTaskId ?? null,
    completedTaskIds: input.completedTaskIds ?? [],
    archivedTaskSummaries: input.archivedTaskSummaries ?? [],
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  })
}
