import { z } from 'zod'
import { ControlModeSchema } from '../types/control-mode.js'

export const TaskSummaryVersion = 'v1' as const

export const TaskSummaryFrontmatterSchema = z.object({
  summaryVersion: z.literal(TaskSummaryVersion).default(TaskSummaryVersion),
  taskId: z.string(),
  taskTitle: z.string(),
  conversationId: z.string().nullable().default(null),
  controlMode: ControlModeSchema,
  taskStatus: z.enum(['task_done', 'task_blocked', 'cancelled']).default('task_done'),
  outcome: z.string(),
  touchedFiles: z.array(z.string()).default([]),
  residualRisks: z.array(z.string()).default([]),
  acceptedOverrides: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  decisionNeededFromUser: z.array(z.string()).default([]),
  nextTaskHints: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type TaskSummaryFrontmatter = z.infer<typeof TaskSummaryFrontmatterSchema>

export const TaskSummaryDocumentSchema = z.object({
  frontmatter: TaskSummaryFrontmatterSchema,
  body: z.string(),
  path: z.string().nullable().default(null),
})

export type TaskSummaryDocument = z.infer<typeof TaskSummaryDocumentSchema>

export interface CreateTaskSummaryDocumentInput {
  frontmatter: TaskSummaryFrontmatter
  body: string
  path?: string | null
}

export function createTaskSummaryDocument(input: CreateTaskSummaryDocumentInput): TaskSummaryDocument {
  return TaskSummaryDocumentSchema.parse({
    frontmatter: input.frontmatter,
    body: input.body,
    path: input.path ?? null,
  })
}
