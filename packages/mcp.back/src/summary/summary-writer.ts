import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  TaskSummaryDocument,
  TaskSummaryDocumentSchema,
  TaskSummaryFrontmatter,
  TaskSummaryFrontmatterSchema,
} from './summary-schema.js'

function serializeFrontmatterValue(value: unknown): string {
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }
  return JSON.stringify(value)
}

export function serializeTaskSummaryFrontmatter(frontmatter: TaskSummaryFrontmatter): string {
  const parsed = TaskSummaryFrontmatterSchema.parse(frontmatter)
  const entries = Object.entries(parsed) as Array<[keyof TaskSummaryFrontmatter, TaskSummaryFrontmatter[keyof TaskSummaryFrontmatter]]>

  return entries
    .map(([key, value]) => `${String(key)}: ${serializeFrontmatterValue(value)}`)
    .join('\n')
}

export function serializeTaskSummaryDocument(document: TaskSummaryDocument): string {
  const parsed = TaskSummaryDocumentSchema.parse(document)
  const frontmatter = serializeTaskSummaryFrontmatter(parsed.frontmatter)
  return `---\n${frontmatter}\n---\n\n${parsed.body.trimEnd()}\n`
}

export function writeTaskSummaryDocument(filePath: string, document: TaskSummaryDocument): TaskSummaryDocument {
  const parsed = TaskSummaryDocumentSchema.parse({
    ...document,
    path: filePath,
  })
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, serializeTaskSummaryDocument(parsed), 'utf8')
  return parsed
}
