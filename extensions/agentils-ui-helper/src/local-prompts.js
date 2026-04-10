import fs from 'node:fs/promises'
import path from 'node:path'
import * as vscode from 'vscode'
import { pickPromptRoot, resolveConfiguredPromptRoots } from './local-paths.js'
import { PROMPT_SUFFIXES } from './constants.js'

function isPromptFileName(fileName) {
  return PROMPT_SUFFIXES.some((suffix) => fileName.endsWith(`.${suffix}.md`))
}

function toPromptKind(fileName) {
  if (fileName.endsWith('.agent.md')) {
    return 'agent'
  }
  if (fileName.endsWith('.chatmode.md')) {
    return 'chatmode'
  }
  return 'prompt'
}

async function walkPromptFiles(root, currentDir = root, results = []) {
  let entries = []
  try {
    entries = await fs.readdir(currentDir, { withFileTypes: true })
  } catch {
    return results
  }

  for (const entry of entries) {
    const entryPath = path.join(currentDir, entry.name)
    if (entry.isDirectory()) {
      await walkPromptFiles(root, entryPath, results)
      continue
    }

    if (!entry.isFile() || !isPromptFileName(entry.name)) {
      continue
    }

    const stat = await fs.stat(entryPath)
    results.push({
      root,
      path: entryPath,
      fileName: entry.name,
      relativePath: path.relative(root, entryPath),
      kind: toPromptKind(entry.name),
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    })
  }

  return results
}

export async function listLocalPrompts() {
  const roots = resolveConfiguredPromptRoots()
  const existingRoots = []
  const files = []

  for (const root of roots) {
    try {
      const stat = await fs.stat(root)
      if (!stat.isDirectory()) {
        continue
      }
      existingRoots.push(root)
      const rootFiles = await walkPromptFiles(root)
      files.push(...rootFiles)
    } catch {
      continue
    }
  }

  return {
    promptRoots: roots,
    existingPromptRoots: existingRoots,
    promptFiles: files.sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
    scannedAt: new Date().toISOString(),
  }
}

function sanitizeBaseName(baseName) {
  const sanitized = baseName
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\.+/, '')
    .replace(/^-+/, '')

  return sanitized || 'agentils-task'
}

function buildTemplate({ name, kind }) {
  const safeName = name || 'agentils-task'
  const commonFrontmatter = [
    '---',
    `name: ${safeName}`,
    `description: AgentILS ${kind} template for local task control`,
    '---',
    '',
  ]

  if (kind === 'chatmode') {
    return [
      ...commonFrontmatter,
      '# AgentILS Chat Mode Template',
      '',
      'Use this prompt to start or continue a task with explicit task boundaries.',
      '',
      '## Inputs',
      '- Goal',
      '- Scope',
      '- Constraints',
      '- Risks',
      '',
      '## Output',
      '- Confirmed task summary',
      '- Suggested next action',
      '',
    ].join('\n')
  }

  if (kind === 'agent') {
    return [
      ...commonFrontmatter,
      '# AgentILS Agent Template',
      '',
      'Use this agent template for a task-oriented AgentILS workflow.',
      '',
      '## Behavior',
      '- Keep the current task small and explicit.',
      '- Prefer summary-based carry-forward over transcript reuse.',
      '- Escalate to the user when risk or scope changes.',
      '',
    ].join('\n')
  }

  return [
    ...commonFrontmatter,
    '# AgentILS Prompt Template',
    '',
    'Describe the task you want AgentILS to execute.',
    '',
    '## Include',
    '- Goal',
    '- Scope',
    '- Constraints',
    '- Risks',
    '- What changed since the last task',
    '',
  ].join('\n')
}

export async function installPromptTemplate(input = {}) {
  const kind = input.kind === 'agent' || input.kind === 'chatmode' ? input.kind : 'prompt'
  const baseName = sanitizeBaseName(input.name ?? vscode.workspace.getConfiguration('agentilsUiHelper').get('defaultPromptName', 'agentils-task'))
  const root = pickPromptRoot(input.targetRoot)

  if (!root) {
    return {
      installed: false,
      reason: 'No prompt root could be resolved.',
    }
  }

  await fs.mkdir(root, { recursive: true })
  const filePath = path.join(root, `${baseName}.${kind}.md`)

  try {
    await fs.access(filePath)
    if (!input.overwrite) {
      return {
        installed: false,
        skipped: true,
        filePath,
        reason: 'Template already exists.',
      }
    }
  } catch {
    // File does not exist yet.
  }

  await fs.writeFile(filePath, buildTemplate({ name: baseName, kind }), 'utf8')

  return {
    installed: true,
    filePath,
    kind,
    root,
  }
}
