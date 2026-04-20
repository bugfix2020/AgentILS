import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

type InjectionTarget = 'vscode' | 'cursor' | 'codex' | 'antigravity'
type InjectionScope = 'workspace' | 'user' | 'both'

interface CliOptions {
  command: 'inject' | 'uninstall' | 'help'
  dryRun: boolean
  workspaceRoot: string
  targets: InjectionTarget[]
  scope: InjectionScope
}

interface ChangeRecord {
  kind: 'write' | 'skip' | 'delete'
  path: string
  detail?: string
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = resolve(packageRoot, '../..')
const supportedTargets: InjectionTarget[] = ['vscode', 'cursor', 'codex', 'antigravity']
const managedBlockStart = '# BEGIN AgentILS managed block'
const managedBlockEnd = '# END AgentILS managed block'
const vscodePromptTemplateFileNames = [
  'agentils.orchestrator.agent.md',
  'agentils.run-code.prompt.md',
  'startnewtask.prompt.md',
  'agentils.run-task.prompt.md',
  'agentils.approval.prompt.md',
  'agentils.feedback.prompt.md',
] as const
const legacyVsCodePromptTemplateFileNames = [
  'agentils.plan.agent.md',
  'agentils.execute.agent.md',
  'agentils.verify.agent.md',
  'agentils.handoff.agent.md',
] as const
const allVsCodePromptTemplateFileNames = [...new Set([
  ...vscodePromptTemplateFileNames,
  ...legacyVsCodePromptTemplateFileNames,
])]

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  if (options.command === 'help') {
    printHelp()
    return
  }

  const changes: ChangeRecord[] = []

  for (const target of options.targets) {
    if (options.command === 'inject') {
      switch (target) {
        case 'vscode':
          injectVsCode(options, changes)
          break
        case 'cursor':
          injectCursor(options, changes)
          break
        case 'codex':
          injectCodex(options, changes)
          break
        case 'antigravity':
          injectAntigravity(options, changes)
          break
      }
      continue
    }

    switch (target) {
      case 'vscode':
        uninstallVsCode(options, changes)
        break
      case 'cursor':
        uninstallCursor(options, changes)
        break
      case 'codex':
        uninstallCodex(options, changes)
        break
      case 'antigravity':
        uninstallAntigravity(options, changes)
        break
    }
  }

  for (const change of changes) {
    const action = change.kind === 'write' ? 'updated' : change.kind === 'delete' ? 'removed' : 'skipped'
    const detail = change.detail ? ` (${change.detail})` : ''
    console.log(`[agentils] ${action}: ${change.path}${detail}`)
  }
}

export function parseArgs(argv: string[]): CliOptions {
  const defaults: CliOptions = {
    command: 'help',
    dryRun: false,
    workspaceRoot: resolve(process.cwd()),
    targets: [],
    scope: 'workspace',
  }

  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    return defaults
  }

  const [command, ...rest] = argv
  if (command !== 'inject' && command !== 'uninstall') {
    throw new Error(`Unknown command: ${command}`)
  }

  const targets: InjectionTarget[] = []
  let workspaceRoot = defaults.workspaceRoot
  let dryRun = false
  let scope: InjectionScope = 'workspace'

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]
    if (token === '--dry-run') {
      dryRun = true
      continue
    }

    if (token === '--workspace') {
      const next = rest[index + 1]
      if (!next) {
        throw new Error('Missing value for --workspace')
      }
      workspaceRoot = resolve(next)
      index += 1
      continue
    }

    if (token === '--scope') {
      const next = rest[index + 1]
      if (!next || !isInjectionScope(next)) {
        throw new Error('--scope must be one of: workspace, user, both')
      }
      scope = next
      index += 1
      continue
    }

    if (token === 'all') {
      targets.splice(0, targets.length, ...supportedTargets)
      continue
    }

    if (!isInjectionTarget(token)) {
      throw new Error(`Unsupported target: ${token}`)
    }

    if (!targets.includes(token)) {
      targets.push(token)
    }
  }

  return {
    command,
    dryRun,
    workspaceRoot,
    targets: targets.length > 0 ? targets : [...supportedTargets],
    scope,
  }
}

function isInjectionTarget(value: string): value is InjectionTarget {
  return supportedTargets.includes(value as InjectionTarget)
}

const supportedScopes: InjectionScope[] = ['workspace', 'user', 'both']
function isInjectionScope(value: string): value is InjectionScope {
  return supportedScopes.includes(value as InjectionScope)
}

function printHelp() {
  console.log(`AgentILS CLI

Usage:
  agentils inject [targets...] [--workspace <path>] [--scope <scope>] [--dry-run]
  agentils uninstall [targets...] [--workspace <path>] [--scope <scope>] [--dry-run]

Targets:
  vscode       Sync Copilot agents, prompts, and MCP config
  cursor       Sync AGENTS.md, Cursor rules, and Cursor MCP config
  codex        Sync AGENTS.md and Codex global config for MCP/doc fallbacks
  antigravity  Sync AGENTS.md plus Antigravity workspace rules and workflows

Scope (--scope, default: workspace):
  workspace    Write only to the project directory (.github/, .vscode/)
  user         Write only to user-level directories (~/.copilot/, VS Code user data)
  both         Write to both workspace and user directories

Examples:
  agentils inject vscode
  agentils inject vscode --scope both
  agentils uninstall vscode
  agentils inject cursor codex --workspace /path/to/repo
  agentils inject all --dry-run
`)
}

function injectVsCode(options: CliOptions, changes: ChangeRecord[]) {
  const templateDir = join(packageRoot, 'templates', 'vscode')
  const toWorkspace = options.scope === 'workspace' || options.scope === 'both'
  const toUser = options.scope === 'user' || options.scope === 'both'

  // 1. MCP config → workspace .vscode/mcp.json (always workspace-scoped)
  if (toWorkspace) {
    const mcpServerPath = fileURLToPath(import.meta.resolve('@agentils/mcp'))
    writeJsonFile(
      join(options.workspaceRoot, '.vscode', 'mcp.json'),
      {
        servers: {
          agentils: {
            type: 'stdio',
            command: 'node',
            args: [mcpServerPath],
          },
        },
      },
      changes,
      options.dryRun,
    )
  }

  // 2. Agent templates
  const agentTemplateDir = join(templateDir, 'agents')
  for (const fileName of listMarkdownFiles(agentTemplateDir)) {
    const content = readNormalized(join(agentTemplateDir, fileName))
    if (toWorkspace) {
      writeTextFile(join(options.workspaceRoot, '.github', 'agents', fileName), content, changes, options.dryRun)
    }
    if (toUser) {
      writeTextFile(join(homedir(), '.copilot', 'agents', fileName), content, changes, options.dryRun)
    }
  }

  // 3. Prompt templates
  const promptTemplateDir = join(templateDir, 'prompts')
  for (const fileName of listMarkdownFiles(promptTemplateDir)) {
    const content = readNormalized(join(promptTemplateDir, fileName))
    if (toWorkspace) {
      writeTextFile(join(options.workspaceRoot, '.github', 'prompts', fileName), content, changes, options.dryRun)
    }
    if (toUser) {
      for (const promptsDir of resolveVsCodePromptsDirs()) {
        writeTextFile(join(promptsDir, fileName), content, changes, options.dryRun)
      }
    }
  }

  // 4. Workspace-level runtime prompts (always workspace-scoped)
  if (toWorkspace) {
    const workspacePromptDir = join(templateDir, 'workspace-prompts')
    for (const fileName of listMarkdownFiles(workspacePromptDir)) {
      const content = readNormalized(join(workspacePromptDir, fileName))
      writeTextFile(join(options.workspaceRoot, '.github', 'prompts', fileName), content, changes, options.dryRun)
    }
  }

  // 5. Clean up legacy user-level files
  if (toUser) {
    for (const promptsDir of resolveVsCodePromptsDirs()) {
      for (const fileName of legacyVsCodePromptTemplateFileNames) {
        removeFile(join(promptsDir, fileName), changes, options.dryRun)
      }
    }
  }
}

function uninstallVsCode(options: CliOptions, changes: ChangeRecord[]) {
  const templateDir = join(packageRoot, 'templates', 'vscode')
  const fromWorkspace = options.scope === 'workspace' || options.scope === 'both'
  const fromUser = options.scope === 'user' || options.scope === 'both'

  // Remove agent files
  const agentTemplateDir = join(templateDir, 'agents')
  for (const fileName of listMarkdownFiles(agentTemplateDir)) {
    if (fromWorkspace) {
      removeFile(join(options.workspaceRoot, '.github', 'agents', fileName), changes, options.dryRun)
    }
    if (fromUser) {
      removeFile(join(homedir(), '.copilot', 'agents', fileName), changes, options.dryRun)
    }
  }

  // Remove prompt files
  const promptTemplateDir = join(templateDir, 'prompts')
  for (const fileName of listMarkdownFiles(promptTemplateDir)) {
    if (fromWorkspace) {
      removeFile(join(options.workspaceRoot, '.github', 'prompts', fileName), changes, options.dryRun)
    }
    if (fromUser) {
      for (const promptsDir of resolveVsCodePromptsDirs()) {
        removeFile(join(promptsDir, fileName), changes, options.dryRun)
      }
    }
  }

  // Remove workspace runtime prompts
  if (fromWorkspace) {
    const workspacePromptDir = join(templateDir, 'workspace-prompts')
    for (const fileName of listMarkdownFiles(workspacePromptDir)) {
      removeFile(join(options.workspaceRoot, '.github', 'prompts', fileName), changes, options.dryRun)
    }
  }

  // Remove legacy user-level files
  if (fromUser) {
    for (const promptsDir of resolveVsCodePromptsDirs()) {
      for (const fileName of legacyVsCodePromptTemplateFileNames) {
        removeFile(join(promptsDir, fileName), changes, options.dryRun)
      }
    }
  }

  if (fromWorkspace) {
    removeJsonProperty(join(options.workspaceRoot, '.vscode', 'mcp.json'), ['servers', 'agentils'], changes, options.dryRun)
  }
}

function injectCursor(options: CliOptions, changes: ChangeRecord[]) {
  syncAgentsInstruction(options.workspaceRoot, changes, options.dryRun)

  const cursorRule = [
    '---',
    'description: AgentILS project rules',
    'alwaysApply: true',
    '---',
    '',
    readNormalized(join(sourceRoot, '.hc', 'instructions', 'agentils.instructions.md')).trim(),
    '',
    'Also read `AGENTS.md` in the repository root before broad codebase scans.',
    '',
  ].join('\n')
  writeTextFile(
    join(options.workspaceRoot, '.cursor', 'rules', 'agentils.mdc'),
    cursorRule,
    changes,
    options.dryRun,
  )

  const mcpServerPath = resolve(sourceRoot, 'packages', 'mcp', 'dist', 'index.js')
  writeJsonFile(
    join(options.workspaceRoot, '.cursor', 'mcp.json'),
    {
      mcpServers: {
        agentils: {
          command: 'node',
          args: [mcpServerPath],
        },
      },
    },
    changes,
    options.dryRun,
  )
}

function uninstallCursor(options: CliOptions, changes: ChangeRecord[]) {
  removeFile(join(options.workspaceRoot, '.cursor', 'rules', 'agentils.mdc'), changes, options.dryRun)
  removeJsonProperty(join(options.workspaceRoot, '.cursor', 'mcp.json'), ['mcpServers', 'agentils'], changes, options.dryRun)
}

function injectCodex(options: CliOptions, changes: ChangeRecord[]) {
  syncAgentsInstruction(options.workspaceRoot, changes, options.dryRun)

  const mcpServerPath = resolve(sourceRoot, 'packages', 'mcp', 'dist', 'index.js')
  const codexConfigPath = join(homedir(), '.codex', 'config.toml')
  const managedBlock = [
    managedBlockStart,
    'project_doc_fallback_filenames = ["AGENTS.md", ".github/copilot-instructions.md"]',
    '',
    '[mcp_servers.agentils]',
    'command = "node"',
    `args = ["${escapeTomlString(mcpServerPath)}"]`,
    managedBlockEnd,
    '',
  ].join('\n')

  writeManagedTomlBlock(codexConfigPath, managedBlock, changes, options.dryRun)
}

function uninstallCodex(options: CliOptions, changes: ChangeRecord[]) {
  removeManagedTomlBlock(join(homedir(), '.codex', 'config.toml'), changes, options.dryRun)
}

function injectAntigravity(options: CliOptions, changes: ChangeRecord[]) {
  syncAgentsInstruction(options.workspaceRoot, changes, options.dryRun)

  const ruleBody = [
    '# AgentILS Antigravity Rule',
    '',
    readNormalized(join(sourceRoot, '.hc', 'instructions', 'agentils.instructions.md')).trim(),
    '',
    'For repository-specific workflow details, read `AGENTS.md` before broad scans.',
    '',
  ].join('\n')
  writeTextFile(
    join(options.workspaceRoot, '.agent', 'rules', 'agentils.md'),
    ruleBody,
    changes,
    options.dryRun,
  )

  const promptDir = join(sourceRoot, '.github', 'prompts')
  for (const fileName of listMarkdownFiles(promptDir)) {
    const workflowName = workflowFileNameFromPrompt(fileName)
    writeTextFile(
      join(options.workspaceRoot, '.agent', 'workflows', workflowName),
      readNormalized(join(promptDir, fileName)),
      changes,
      options.dryRun,
    )
  }
}

function uninstallAntigravity(options: CliOptions, changes: ChangeRecord[]) {
  removeFile(join(options.workspaceRoot, '.agent', 'rules', 'agentils.md'), changes, options.dryRun)

  const promptDir = join(sourceRoot, '.github', 'prompts')
  for (const fileName of listMarkdownFiles(promptDir)) {
    removeFile(join(options.workspaceRoot, '.agent', 'workflows', workflowFileNameFromPrompt(fileName)), changes, options.dryRun)
  }
}

function syncGeneratedInstructions(workspaceRoot: string, changes: ChangeRecord[], dryRun: boolean) {
  const manifestPath = join(sourceRoot, '.hc', 'instructions', 'sync-manifest.json')
  const manifest = JSON.parse(readNormalized(manifestPath)) as Array<{ source: string, target: string }>

  for (const entry of manifest) {
    const sourcePath = join(sourceRoot, entry.source)
    const generated = [
      '<!-- Generated by packages/cli/src/index.ts. -->',
      `<!-- Source: ${entry.source} -->`,
      '<!-- Edit the source file in AgentILS, not this generated target. -->',
      '',
      readNormalized(sourcePath).trimEnd(),
      '',
    ].join('\n')
    writeTextFile(join(workspaceRoot, entry.target), generated, changes, dryRun)
  }
}

function syncAgentsInstruction(workspaceRoot: string, changes: ChangeRecord[], dryRun: boolean) {
  const sourcePath = join(sourceRoot, '.hc', 'instructions', 'AGENTS.md')
  const generated = [
    '<!-- Generated by packages/cli/src/index.ts. -->',
    '<!-- Source: .hc/instructions/AGENTS.md -->',
    '<!-- Edit the source file in AgentILS, not this generated target. -->',
    '',
    readNormalized(sourcePath).trimEnd(),
    '',
  ].join('\n')
  writeTextFile(join(workspaceRoot, 'AGENTS.md'), generated, changes, dryRun)
}

function syncPromptFilesIntoWorkspace(workspaceRoot: string, changes: ChangeRecord[], dryRun: boolean) {
  const promptDir = join(sourceRoot, '.github', 'prompts')
  for (const fileName of listMarkdownFiles(promptDir)) {
    writeTextFile(
      join(workspaceRoot, '.github', 'prompts', fileName),
      readNormalized(join(promptDir, fileName)),
      changes,
      dryRun,
    )
  }
}

function listMarkdownFiles(directoryPath: string): string[] {
  return readdirSync(directoryPath)
    .filter((entry) => {
      const fullPath = join(directoryPath, entry)
      return existsSync(fullPath) && extname(entry) === '.md'
    })
    .sort((left, right) => left.localeCompare(right))
}

function writeJsonFile(filePath: string, payload: unknown, changes: ChangeRecord[], dryRun: boolean) {
  writeTextFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, changes, dryRun)
}

function writeManagedTomlBlock(filePath: string, managedBlock: string, changes: ChangeRecord[], dryRun: boolean) {
  const current = existsSync(filePath) ? readNormalized(filePath) : ''
  const next = replaceManagedBlock(current, managedBlock)
  writeTextFile(filePath, next, changes, dryRun)
}

function removeManagedTomlBlock(filePath: string, changes: ChangeRecord[], dryRun: boolean) {
  if (!existsSync(filePath)) {
    changes.push({
      kind: 'skip',
      path: filePath,
      detail: 'not found',
    })
    return
  }

  const current = readNormalized(filePath)
  const next = removeManagedBlock(current)
  if (next === current) {
    changes.push({
      kind: 'skip',
      path: filePath,
      detail: 'no managed block',
    })
    return
  }

  if (next.length === 0) {
    removeFile(filePath, changes, dryRun)
    return
  }

  writeTextFile(filePath, next, changes, dryRun)
}

export function replaceManagedBlock(current: string, managedBlock: string): string {
  const startIndex = current.indexOf(managedBlockStart)
  const endIndex = current.indexOf(managedBlockEnd)
  if (startIndex >= 0 && endIndex >= startIndex) {
    const before = current.slice(0, startIndex).trimEnd()
    const after = current.slice(endIndex + managedBlockEnd.length).trimStart()
    return normalizeTrailingNewline([before, managedBlock.trimEnd(), after].filter(Boolean).join('\n\n'))
  }

  if (current.trim().length === 0) {
    return normalizeTrailingNewline(managedBlock)
  }

  return normalizeTrailingNewline(`${current.trimEnd()}\n\n${managedBlock.trimEnd()}`)
}

export function removeManagedBlock(current: string): string {
  const startIndex = current.indexOf(managedBlockStart)
  const endIndex = current.indexOf(managedBlockEnd)
  if (startIndex < 0 || endIndex < startIndex) {
    return current
  }

  const before = current.slice(0, startIndex).trimEnd()
  const after = current.slice(endIndex + managedBlockEnd.length).trimStart()
  const merged = [before, after].filter(Boolean).join('\n\n')
  if (merged.length === 0) {
    return ''
  }
  return normalizeTrailingNewline(merged)
}

function writeTextFile(filePath: string, content: string, changes: ChangeRecord[], dryRun: boolean) {
  const normalizedContent = normalizeTrailingNewline(content)
  const current = existsSync(filePath) ? readNormalized(filePath) : null

  if (current === normalizedContent) {
    changes.push({
      kind: 'skip',
      path: filePath,
      detail: 'up to date',
    })
    return
  }

  changes.push({
    kind: 'write',
    path: filePath,
    detail: dryRun ? 'dry run' : undefined,
  })

  if (dryRun) {
    return
  }

  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, normalizedContent, 'utf8')
}

function removeFile(filePath: string, changes: ChangeRecord[], dryRun: boolean) {
  if (!existsSync(filePath)) {
    changes.push({
      kind: 'skip',
      path: filePath,
      detail: 'not found',
    })
    return
  }

  changes.push({
    kind: 'delete',
    path: filePath,
    detail: dryRun ? 'dry run' : undefined,
  })

  if (dryRun) {
    return
  }

  rmSync(filePath, { force: true })
}

function readNormalized(filePath: string) {
  return readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n')
}

function normalizeTrailingNewline(value: string) {
  return `${value.replace(/\r\n/g, '\n').trimEnd()}\n`
}

function removeJsonProperty(filePath: string, pathSegments: string[], changes: ChangeRecord[], dryRun: boolean) {
  if (!existsSync(filePath)) {
    changes.push({
      kind: 'skip',
      path: filePath,
      detail: 'not found',
    })
    return
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(readNormalized(filePath))
  } catch {
    changes.push({
      kind: 'skip',
      path: filePath,
      detail: 'invalid json',
    })
    return
  }

  if (!removeNestedProperty(parsed, pathSegments)) {
    changes.push({
      kind: 'skip',
      path: filePath,
      detail: 'not configured',
    })
    return
  }

  if (isEmptyObject(parsed)) {
    removeFile(filePath, changes, dryRun)
    return
  }

  writeJsonFile(filePath, parsed, changes, dryRun)
}

function removeNestedProperty(value: unknown, pathSegments: string[]): boolean {
  if (!value || typeof value !== 'object' || pathSegments.length === 0) {
    return false
  }

  return removeNestedPropertyFromObject(value as Record<string, unknown>, pathSegments)
}

function removeNestedPropertyFromObject(cursor: Record<string, unknown>, pathSegments: string[]): boolean {
  const [head, ...tail] = pathSegments

  if (tail.length === 0) {
    if (!(head in cursor)) {
      return false
    }
    delete cursor[head]
    return true
  }

  const next = cursor[head]
  if (!next || typeof next !== 'object' || Array.isArray(next)) {
    return false
  }

  const removed = removeNestedPropertyFromObject(next as Record<string, unknown>, tail)
  if (!removed) {
    return false
  }

  if (isEmptyObject(next)) {
    delete cursor[head]
  }

  return true
}

function isEmptyObject(value: unknown): boolean {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length === 0
}

function resolveVsCodePromptsDirs() {
  const userDataPath =
    process.env.APPDATA ||
    (process.platform === 'darwin'
      ? join(homedir(), 'Library', 'Application Support')
      : join(homedir(), '.config'))

  const candidates = ['Code', 'Code - Insiders']
    .map((folder) => join(userDataPath, folder, 'User', 'prompts'))
    .filter((candidate, index, items) => items.indexOf(candidate) === index)

  const existing = candidates.filter((candidate) => existsSync(candidate))
  return existing.length > 0 ? existing : [candidates[0]]
}

function escapeTomlString(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

export function workflowFileNameFromPrompt(fileName: string) {
  if (fileName.endsWith('.prompt.md')) {
    return `${fileName.slice(0, -'.prompt.md'.length)}.md`
  }

  const stem = basename(fileName, extname(fileName))
  return `${stem}.md`
}

const entrypointPath = process.argv[1] ? resolve(process.argv[1]) : null
const currentModulePath = resolve(fileURLToPath(import.meta.url))

if (entrypointPath === currentModulePath) {
  await main()
}
