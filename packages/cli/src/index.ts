import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

type InjectionTarget = 'vscode' | 'cursor' | 'codex' | 'antigravity'

interface CliOptions {
  command: 'inject' | 'help'
  dryRun: boolean
  workspaceRoot: string
  targets: InjectionTarget[]
}

interface ChangeRecord {
  kind: 'write' | 'skip'
  path: string
  detail?: string
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = resolve(packageRoot, '../..')
const supportedTargets: InjectionTarget[] = ['vscode', 'cursor', 'codex', 'antigravity']
const managedBlockStart = '# BEGIN AgentILS managed block'
const managedBlockEnd = '# END AgentILS managed block'

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  if (options.command === 'help') {
    printHelp()
    return
  }

  const changes: ChangeRecord[] = []

  for (const target of options.targets) {
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
  }

  for (const change of changes) {
    const action = change.kind === 'write' ? 'updated' : 'skipped'
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
  }

  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    return defaults
  }

  const [command, ...rest] = argv
  if (command !== 'inject') {
    throw new Error(`Unknown command: ${command}`)
  }

  const targets: InjectionTarget[] = []
  let workspaceRoot = defaults.workspaceRoot
  let dryRun = false

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
    command: 'inject',
    dryRun,
    workspaceRoot,
    targets: targets.length > 0 ? targets : [...supportedTargets],
  }
}

function isInjectionTarget(value: string): value is InjectionTarget {
  return supportedTargets.includes(value as InjectionTarget)
}

function printHelp() {
  console.log(`AgentILS CLI

Usage:
  agentils inject [targets...] [--workspace <path>] [--dry-run]

Targets:
  vscode       Sync Copilot instructions, prompt files, VS Code MCP config, and VS Code user prompts
  cursor       Sync AGENTS.md, Cursor rules, and Cursor MCP config
  codex        Sync AGENTS.md and Codex global config for MCP/doc fallbacks
  antigravity  Sync AGENTS.md plus Antigravity workspace rules and workflows

Examples:
  agentils inject vscode
  agentils inject cursor codex --workspace /path/to/repo
  agentils inject all --dry-run
`)
}

function injectVsCode(options: CliOptions, changes: ChangeRecord[]) {
  syncGeneratedInstructions(options.workspaceRoot, changes, options.dryRun)
  syncPromptFilesIntoWorkspace(options.workspaceRoot, changes, options.dryRun)

  const mcpServerPath = resolve(sourceRoot, 'packages', 'mcp', 'dist', 'index.js')
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

  const promptsDir = resolveVsCodePromptsDir()
  const templateDir = join(sourceRoot, 'extensions', 'agentils-vscode', 'templates')
  for (const fileName of listMarkdownFiles(templateDir)) {
    const sourcePath = join(templateDir, fileName)
    writeTextFile(
      join(promptsDir, fileName),
      readNormalized(sourcePath),
      changes,
      options.dryRun,
    )
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

function readNormalized(filePath: string) {
  return readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n')
}

function normalizeTrailingNewline(value: string) {
  return `${value.replace(/\r\n/g, '\n').trimEnd()}\n`
}

function resolveVsCodePromptsDir() {
  const userDataPath =
    process.env.APPDATA ||
    (process.platform === 'darwin'
      ? join(homedir(), 'Library', 'Application Support')
      : join(homedir(), '.config'))

  return join(userDataPath, 'Code', 'User', 'prompts')
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
