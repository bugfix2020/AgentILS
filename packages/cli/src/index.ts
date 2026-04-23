/**
 * AgentILS (Intelligent Logical System) CLI
 *
 * Installs prompt/agent templates and registers the @agentils/mcp server with
 * VS Code (or any MCP-aware IDE). Supports two install scopes:
 *
 *   --user (default)     Writes prompts/agents to the VS Code user profile.
 *   --workspace [<dir>]  Writes prompts/agents to <dir>/.github/{prompts,agents}
 *                        and (re)merges <dir>/.vscode/mcp.json with the
 *                        AgentILS stdio server entry.
 *
 * The 24 templates under `templates/files/` are derived from the original
 * `human-clarification` vsix but with **all** identifiers rewritten to the
 * AgentILS namespace, so the two extensions can co-exist without collisions.
 */
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, platform } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const TEMPLATES_DIR = join(__dirname, '..', 'templates')

interface Args {
  command: 'init' | 'uninstall' | 'help'
  scope: 'user' | 'workspace'
  workspace: string
}

function parseArgs(argv: string[]): Args {
  const out: Args = { command: 'help', scope: 'user', workspace: process.cwd() }
  const [cmd, ...rest] = argv
  if (cmd === 'init' || cmd === 'uninstall') out.command = cmd

  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (a === '--vscode') continue
    else if (a === '--user') out.scope = 'user'
    else if (a === '--workspace' || a === '-w') {
      out.scope = 'workspace'
      const next = rest[i + 1]
      if (next && !next.startsWith('-')) {
        out.workspace = resolve(next)
        i++
      }
    }
  }
  return out
}

const HELP = `AgentILS (Intelligent Logical System) CLI

Usage:
  agentils init      [--vscode] [--user|--workspace [dir]]
  agentils uninstall [--vscode] [--user|--workspace [dir]]

  --user (default)         install to VS Code user profile
  --workspace [<dir>]      install to <dir>/.github/{prompts,agents}
                           and merge <dir>/.vscode/mcp.json (cwd if no dir)

Examples:
  npx @agentils/cli init
  npx @agentils/cli init --workspace ./my-project
  npx @agentils/cli uninstall --workspace .
`

function userPromptsDir(): string {
  switch (platform()) {
    case 'darwin':
      return join(homedir(), 'Library', 'Application Support', 'Code', 'User', 'prompts')
    case 'win32':
      return join(homedir(), 'AppData', 'Roaming', 'Code', 'User', 'prompts')
    default:
      return join(homedir(), '.config', 'Code', 'User', 'prompts')
  }
}

function userAgentsDir(): string {
  return join(dirname(userPromptsDir()), 'agents')
}

function userSettingsPath(): string {
  return join(dirname(userPromptsDir()), 'settings.json')
}

async function ensureDir(p: string): Promise<void> {
  await mkdir(p, { recursive: true })
}

async function readJsonIfExists(p: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(p, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

async function listTemplateFiles(): Promise<{ prompts: string[]; agents: string[] }> {
  const all = await readdir(join(TEMPLATES_DIR, 'files'))
  return {
    prompts: all.filter((f) => f.endsWith('.prompt.md')),
    agents: all.filter((f) => f.endsWith('.agent.md') || f.endsWith('.chatmode.md')),
  }
}

async function copyTemplate(file: string, fromSubdir: string, toDir: string): Promise<string> {
  await ensureDir(toDir)
  const body = await readFile(join(TEMPLATES_DIR, fromSubdir, file), 'utf8')
  const dst = join(toDir, file)
  await writeFile(dst, body, 'utf8')
  return dst
}

async function copySamplePrompts(toDir: string): Promise<string[]> {
  const dir = join(TEMPLATES_DIR, 'sample-prompts')
  if (!existsSync(dir)) return []
  const written: string[] = []
  for (const file of await readdir(dir)) {
    written.push(await copyTemplate(file, 'sample-prompts', toDir))
  }
  return written
}

async function injectMcpJson(workspace: string): Promise<string> {
  const mcpPath = join(workspace, '.vscode', 'mcp.json')
  await ensureDir(dirname(mcpPath))
  const existing = (await readJsonIfExists(mcpPath)) ?? {}
  const servers = (existing.servers as Record<string, unknown>) ?? {}
  servers.agentils = {
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@agentils/mcp', '--stdio'],
  }
  await writeFile(mcpPath, JSON.stringify({ ...existing, servers }, null, 2), 'utf8')
  return mcpPath
}

async function injectUserSettings(): Promise<string | null> {
  const cfgPath = join(TEMPLATES_DIR, 'config.json')
  if (!existsSync(cfgPath)) return null
  const presets = JSON.parse(await readFile(cfgPath, 'utf8')) as Record<string, unknown>
  const settingsPath = userSettingsPath()
  await ensureDir(dirname(settingsPath))
  const existing = (await readJsonIfExists(settingsPath)) ?? {}
  for (const [k, v] of Object.entries(presets)) {
    if (existing[k] === undefined) existing[k] = v
  }
  await writeFile(settingsPath, JSON.stringify(existing, null, 2), 'utf8')
  return settingsPath
}

async function doInit(args: Args): Promise<void> {
  const { prompts, agents } = await listTemplateFiles()
  const written: string[] = []

  if (args.scope === 'user') {
    const promptsDir = userPromptsDir()
    const agentsDir = userAgentsDir()
    for (const f of prompts) written.push(await copyTemplate(f, 'files', promptsDir))
    for (const f of agents) written.push(await copyTemplate(f, 'files', agentsDir))
    written.push(...(await copySamplePrompts(promptsDir)))
    const settings = await injectUserSettings()
    if (settings) written.push(settings)
  } else {
    const promptsDir = join(args.workspace, '.github', 'prompts')
    const agentsDir = join(args.workspace, '.github', 'agents')
    for (const f of prompts) written.push(await copyTemplate(f, 'files', promptsDir))
    for (const f of agents) written.push(await copyTemplate(f, 'files', agentsDir))
    written.push(...(await copySamplePrompts(promptsDir)))
    written.push(await injectMcpJson(args.workspace))
  }

  process.stdout.write(`AgentILS installed (${args.scope}). Wrote ${written.length} files:\n`)
  for (const w of written) process.stdout.write(`  + ${w}\n`)
  process.stdout.write(`\nReload VS Code to pick up the new prompts and MCP server.\n`)
}

async function doUninstall(args: Args): Promise<void> {
  const { prompts, agents } = await listTemplateFiles()
  let removed = 0
  const tryUnlink = async (p: string) => {
    if (!existsSync(p)) return
    await rm(p, { force: true })
    removed++
  }

  if (args.scope === 'user') {
    const promptsDir = userPromptsDir()
    const agentsDir = userAgentsDir()
    for (const f of prompts) await tryUnlink(join(promptsDir, f))
    for (const f of agents) await tryUnlink(join(agentsDir, f))
    const sampleDir = join(TEMPLATES_DIR, 'sample-prompts')
    if (existsSync(sampleDir)) {
      for (const f of await readdir(sampleDir)) await tryUnlink(join(promptsDir, f))
    }
  } else {
    const promptsDir = join(args.workspace, '.github', 'prompts')
    const agentsDir = join(args.workspace, '.github', 'agents')
    for (const f of prompts) await tryUnlink(join(promptsDir, f))
    for (const f of agents) await tryUnlink(join(agentsDir, f))
    const mcpPath = join(args.workspace, '.vscode', 'mcp.json')
    const existing = await readJsonIfExists(mcpPath)
    if (existing && existing.servers && typeof existing.servers === 'object') {
      const servers = existing.servers as Record<string, unknown>
      delete servers.agentils
      await writeFile(mcpPath, JSON.stringify(existing, null, 2), 'utf8')
    }
  }
  process.stdout.write(`AgentILS uninstalled (${args.scope}). Removed ${removed} files.\n`)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.command === 'help') {
    process.stdout.write(HELP)
    return
  }
  if (args.command === 'init') return doInit(args)
  if (args.command === 'uninstall') return doUninstall(args)
}

main().catch((err) => {
  process.stderr.write(`agentils: ${(err as Error).message}\n`)
  process.exit(1)
})
