import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { normalizeControlMode, type ControlMode } from '../control/control-modes.js'
import { type OverrideState } from '../control/override-policy.js'

export interface TaskSummaryDocumentFrontmatter {
  taskId: string
  runId: string
  title: string
  outcome: string
  controlMode: ControlMode
  acceptedRisks: string[]
  skippedChecks: string[]
  createdAt: string
  updatedAt: string
}

export interface TaskSummaryDocument {
  frontmatter: TaskSummaryDocumentFrontmatter
  body: string
}

export interface SummaryWriteInput {
  taskId: string
  runId: string
  title: string
  outcome: string
  body: string
  controlMode?: ControlMode | string | null
  overrideState?: OverrideState | null
  baseDir?: string
}

export interface SummaryStoreAdapter {
  stateFilePath?: string
}

function quote(value: string): string {
  return JSON.stringify(value)
}

function renderFrontmatter(frontmatter: TaskSummaryDocumentFrontmatter): string {
  const lines = [
    '---',
    `taskId: ${quote(frontmatter.taskId)}`,
    `runId: ${quote(frontmatter.runId)}`,
    `title: ${quote(frontmatter.title)}`,
    `outcome: ${quote(frontmatter.outcome)}`,
    `controlMode: ${quote(frontmatter.controlMode)}`,
    `acceptedRisks: ${JSON.stringify(frontmatter.acceptedRisks)}`,
    `skippedChecks: ${JSON.stringify(frontmatter.skippedChecks)}`,
    `createdAt: ${quote(frontmatter.createdAt)}`,
    `updatedAt: ${quote(frontmatter.updatedAt)}`,
    '---',
  ]
  return lines.join('\n')
}

export function renderTaskSummaryDocument(document: TaskSummaryDocument): string {
  return `${renderFrontmatter(document.frontmatter)}\n${document.body.trimEnd()}\n`
}

export function parseTaskSummaryDocument(raw: string): TaskSummaryDocument | null {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) {
    return null
  }

  const frontmatterLines = match[1].split('\n')
  const frontmatter: Record<string, unknown> = {}

  for (const line of frontmatterLines) {
    const separatorIndex = line.indexOf(':')
    if (separatorIndex === -1) {
      continue
    }
    const key = line.slice(0, separatorIndex).trim()
    const rawValue = line.slice(separatorIndex + 1).trim()
    try {
      frontmatter[key] = JSON.parse(rawValue)
    } catch {
      frontmatter[key] = rawValue
    }
  }

  const taskId = typeof frontmatter.taskId === 'string' ? frontmatter.taskId : ''
  const runId = typeof frontmatter.runId === 'string' ? frontmatter.runId : ''
  const title = typeof frontmatter.title === 'string' ? frontmatter.title : ''
  const outcome = typeof frontmatter.outcome === 'string' ? frontmatter.outcome : ''
  const controlMode = normalizeControlMode(typeof frontmatter.controlMode === 'string' ? frontmatter.controlMode : null)
  const acceptedRisks = Array.isArray(frontmatter.acceptedRisks)
    ? frontmatter.acceptedRisks.filter((item): item is string => typeof item === 'string')
    : []
  const skippedChecks = Array.isArray(frontmatter.skippedChecks)
    ? frontmatter.skippedChecks.filter((item): item is string => typeof item === 'string')
    : []
  const createdAt = typeof frontmatter.createdAt === 'string' ? frontmatter.createdAt : new Date().toISOString()
  const updatedAt = typeof frontmatter.updatedAt === 'string' ? frontmatter.updatedAt : createdAt

  if (!taskId || !runId) {
    return null
  }

  return {
    frontmatter: {
      taskId,
      runId,
      title,
      outcome,
      controlMode,
      acceptedRisks,
      skippedChecks,
      createdAt,
      updatedAt,
    },
    body: match[2],
  }
}

export class AgentGateSummaryStore {
  constructor(private readonly baseDir = resolve(process.env.AGENTILS_SUMMARY_DIR ?? '.data/agentils-summaries')) {}

  resolveSummaryPath(taskId: string): string {
    return resolve(this.baseDir, taskId, 'task-summary.md')
  }

  writeSummary(input: SummaryWriteInput): TaskSummaryDocument {
    const path = this.resolveSummaryPath(input.taskId)
    const document: TaskSummaryDocument = {
      frontmatter: {
        taskId: input.taskId,
        runId: input.runId,
        title: input.title,
        outcome: input.outcome,
        controlMode: normalizeControlMode(input.controlMode ?? null),
        acceptedRisks: input.overrideState?.acceptedRisks ?? [],
        skippedChecks: input.overrideState?.skippedChecks ?? [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      body: input.body,
    }

    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, renderTaskSummaryDocument(document), 'utf8')
    return document
  }

  readSummary(taskId: string): TaskSummaryDocument | null {
    const path = this.resolveSummaryPath(taskId)
    try {
      const raw = readFileSync(path, 'utf8')
      return parseTaskSummaryDocument(raw)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null
      }
      throw error
    }
  }
}

