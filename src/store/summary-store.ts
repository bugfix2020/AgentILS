import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { normalizeControlMode, type ControlMode } from '../control/control-modes.js'
import { type OverrideState } from '../control/override-policy.js'
import {
  createTaskSummaryDocument,
  type TaskSummaryDocument,
  type TaskSummaryFrontmatter,
} from '../summary/summary-schema.js'
import { readTaskSummaryDocument } from '../summary/summary-loader.js'
import { serializeTaskSummaryDocument, writeTaskSummaryDocument } from '../summary/summary-writer.js'

export interface SummaryWriteInput {
  taskId: string
  runId: string
  conversationId?: string | null
  taskTitle: string
  outcome: string
  body: string
  controlMode?: ControlMode | string | null
  taskStatus?: 'task_done' | 'task_blocked' | 'cancelled'
  touchedFiles?: string[]
  residualRisks?: string[]
  openQuestions?: string[]
  assumptions?: string[]
  decisionNeededFromUser?: string[]
  nextTaskHints?: string[]
  overrideState?: OverrideState | null
}

export type { TaskSummaryDocument, TaskSummaryFrontmatter }

export function renderTaskSummaryDocument(document: TaskSummaryDocument): string {
  return serializeTaskSummaryDocument(document)
}

export class AgentGateSummaryStore {
  constructor(private readonly baseDir = resolve(process.env.AGENTILS_SUMMARY_DIR ?? '.data/agentils-summaries')) {}

  resolveSummaryPath(taskId: string): string {
    return resolve(this.baseDir, taskId, 'task-summary.md')
  }

  writeSummary(input: SummaryWriteInput): TaskSummaryDocument {
    const path = this.resolveSummaryPath(input.taskId)
    const now = new Date().toISOString()
    const frontmatter: TaskSummaryFrontmatter = {
      summaryVersion: 'v1',
      taskId: input.taskId,
      taskTitle: input.taskTitle,
      conversationId: input.conversationId ?? null,
      controlMode: normalizeControlMode(input.controlMode ?? null),
      taskStatus: input.taskStatus ?? 'task_done',
      outcome: input.outcome,
      touchedFiles: [...(input.touchedFiles ?? [])],
      residualRisks: [...(input.residualRisks ?? [])],
      acceptedOverrides: input.overrideState?.confirmed ? [input.overrideState.summary] : [],
      openQuestions: [...(input.openQuestions ?? [])],
      assumptions: [...(input.assumptions ?? [])],
      decisionNeededFromUser: [...(input.decisionNeededFromUser ?? [])],
      nextTaskHints: [...(input.nextTaskHints ?? [])],
      createdAt: now,
      updatedAt: now,
    }

    const document = createTaskSummaryDocument({
      frontmatter,
      body: input.body,
      path,
    })

    return writeTaskSummaryDocument(path, document)
  }

  readSummary(taskId: string): TaskSummaryDocument | null {
    const path = this.resolveSummaryPath(taskId)
    try {
      return readTaskSummaryDocument(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null
      }
      throw error
    }
  }

  readSummaryRaw(taskId: string): string | null {
    const path = this.resolveSummaryPath(taskId)
    try {
      return readFileSync(path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null
      }
      throw error
    }
  }
}
