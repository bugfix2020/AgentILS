import { readFileSync } from 'node:fs'
import {
  CreateTaskSummaryDocumentInput,
  TaskSummaryDocument,
  TaskSummaryDocumentSchema,
  TaskSummaryFrontmatter,
  TaskSummaryFrontmatterSchema,
  createTaskSummaryDocument,
} from './summary-schema.js'

function parseFrontmatterValue(value: string): unknown {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return ''
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    return trimmed
  }
}

export function parseTaskSummaryFrontmatter(text: string): TaskSummaryFrontmatter {
  const entries = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const separatorIndex = line.indexOf(':')
      if (separatorIndex < 0) {
        throw new Error(`Invalid summary frontmatter line: ${line}`)
      }

      const key = line.slice(0, separatorIndex).trim()
      const value = line.slice(separatorIndex + 1)
      return [key, parseFrontmatterValue(value)] as const
    })

  const record = Object.fromEntries(entries)
  return TaskSummaryFrontmatterSchema.parse(record)
}

export function readTaskSummaryDocument(filePath: string): TaskSummaryDocument {
  const raw = readFileSync(filePath, 'utf8')
  const trimmed = raw.trimStart()
  if (!trimmed.startsWith('---')) {
    throw new Error(`Task summary document missing frontmatter: ${filePath}`)
  }

  const sections = trimmed.split('\n---\n')
  if (sections.length < 2) {
    throw new Error(`Task summary document missing body separator: ${filePath}`)
  }

  const firstSeparatorEnd = trimmed.indexOf('\n---\n')
  const frontmatterText = trimmed.slice(4, firstSeparatorEnd)
  const bodyText = trimmed.slice(firstSeparatorEnd + 5)

  return createTaskSummaryDocument({
    frontmatter: parseTaskSummaryFrontmatter(frontmatterText),
    body: bodyText.trimEnd(),
    path: filePath,
  })
}
