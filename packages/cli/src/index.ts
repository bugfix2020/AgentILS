/**
 * AgentILS (Intelligent Logical System) CLI
 *
 * Installs prompt/agent templates and registers the @agent-ils/mcp server with
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
import { randomUUID } from 'node:crypto'
import { homedir, platform } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHttpLogger, type Logger } from '@agent-ils/logger'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const TEMPLATES_DIR = join(__dirname, '..', 'templates')
const TEMPLATE_FILES_DIR = join(TEMPLATES_DIR, 'files')
const SAMPLE_PROMPTS_DIR = join(TEMPLATES_DIR, 'sample-prompts')
const TEMPLATE_PREFIX = 'agentils.'
const ALLOWED_TEMPLATE_EXTS = ['.prompt.md', '.chatmode.md', '.agent.md'] as const

interface Args {
    command: 'init' | 'uninstall' | 'help'
    scope: 'user' | 'workspace'
    workspace: string
}

interface CliContext {
    args: Args
    log: Logger
    traceId: string
}

const noopLogger: Logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    child: () => noopLogger,
}

function parseArgs(argv: string[]): Args {
    const out: Args = { command: 'help', scope: 'user', workspace: process.cwd() }
    const [cmd, ...rest] = argv
    if (cmd === 'init' || cmd === 'uninstall') out.command = cmd
    else if (cmd === 'install') out.command = 'init'

    for (let i = 0; i < rest.length; i++) {
        const a = rest[i]
        if (a === '--vscode' || a === 'vscode') continue
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
  npx @agent-ils/cli init
  npx @agent-ils/cli init --workspace ./my-project
  npx @agent-ils/cli uninstall --workspace .
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
    return userPromptsDir()
}

function legacyUserAgentsDir(): string {
    return join(dirname(userPromptsDir()), 'agents')
}

function userSettingsPath(): string {
    return join(dirname(userPromptsDir()), 'settings.json')
}

async function ensureDir(p: string): Promise<void> {
    await mkdir(p, { recursive: true })
}

async function readJsonIfExists(p: string): Promise<Record<string, unknown> | null> {
    if (!existsSync(p)) return null
    const raw = await readFile(p, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed)) throw new Error(`JSON root must be an object: ${p}`)
    return parsed
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function createCliContext(args: Args): CliContext {
    const traceId = `cli-${randomUUID()}`
    const log = createHttpLogger({
        source: 'cli',
        namespace: 'agentils.cli',
        filePrefix: 'agentils-cli',
        fallback: noopLogger,
        respectDebugEnv: true,
        defaultFields: {
            component: 'cli',
            traceId,
            workspace: args.workspace,
            scope: args.scope,
        },
    })
    return { args, log, traceId }
}

function logFields(ctx: CliContext, fields: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        component: 'cli',
        traceId: ctx.traceId,
        scope: ctx.args.scope,
        workspace: ctx.args.workspace,
        ...fields,
    }
}

function isAllowedTemplateName(fileName: string): boolean {
    return (
        basename(fileName) === fileName &&
        fileName.startsWith(TEMPLATE_PREFIX) &&
        ALLOWED_TEMPLATE_EXTS.some((ext) => fileName.endsWith(ext))
    )
}

function isPromptTemplate(fileName: string): boolean {
    return fileName.endsWith('.prompt.md')
}

function isAgentTemplate(fileName: string): boolean {
    return fileName.endsWith('.agent.md') || fileName.endsWith('.chatmode.md')
}

async function listTemplateFiles(ctx: CliContext): Promise<{ prompts: string[]; agents: string[] }> {
    const all = await readdir(TEMPLATE_FILES_DIR)
    const safe = all.filter(isAllowedTemplateName)
    const skipped = all.filter((file) => !isAllowedTemplateName(file))
    const templates = {
        prompts: safe.filter(isPromptTemplate),
        agents: safe.filter(isAgentTemplate),
    }
    ctx.log.info(
        'template list loaded',
        logFields(ctx, {
            operation: 'listTemplates',
            prompts: templates.prompts.length,
            agents: templates.agents.length,
            skipped,
        }),
    )
    return templates
}

async function listSampleTemplates(ctx: CliContext): Promise<{ prompts: string[]; agents: string[] }> {
    if (!existsSync(SAMPLE_PROMPTS_DIR)) return { prompts: [], agents: [] }
    const all = await readdir(SAMPLE_PROMPTS_DIR)
    const safe = all.filter(isAllowedTemplateName)
    const templates = {
        prompts: safe.filter(isPromptTemplate),
        agents: safe.filter(isAgentTemplate),
    }
    ctx.log.info(
        'sample template list loaded',
        logFields(ctx, {
            operation: 'listSampleTemplates',
            prompts: templates.prompts.length,
            agents: templates.agents.length,
        }),
    )
    return templates
}

async function copyTemplate(ctx: CliContext, file: string, fromSubdir: string, toDir: string): Promise<string> {
    if (!isAllowedTemplateName(file)) throw new Error(`Invalid AgentILS template file name: ${file}`)
    await ensureDir(toDir)
    const body = await readFile(join(TEMPLATES_DIR, fromSubdir, file), 'utf8')
    if (Buffer.byteLength(body, 'utf8') > 1024 * 1024) {
        throw new Error(`Template file too large (>1MB): ${file}`)
    }
    const dst = join(toDir, file)
    const overwritten = existsSync(dst)
    await writeFile(dst, body, 'utf8')
    ctx.log.info(
        'file copied',
        logFields(ctx, {
            operation: 'copyTemplate',
            templateName: file,
            targetPath: dst,
            overwritten,
        }),
    )
    return dst
}

async function copySampleTemplates(ctx: CliContext, promptsDir: string, agentsDir: string): Promise<string[]> {
    const { prompts, agents } = await listSampleTemplates(ctx)
    const written: string[] = []
    for (const file of prompts) written.push(await copyTemplate(ctx, file, 'sample-prompts', promptsDir))
    for (const file of agents) written.push(await copyTemplate(ctx, file, 'sample-prompts', agentsDir))
    return written
}

async function injectMcpJson(ctx: CliContext, workspace: string): Promise<string> {
    const mcpPath = join(workspace, '.vscode', 'mcp.json')
    await ensureDir(dirname(mcpPath))
    ctx.log.info(
        'JSON merge started',
        logFields(ctx, {
            operation: 'mergeMcpJson',
            targetPath: mcpPath,
        }),
    )
    const existing = (await readJsonIfExists(mcpPath)) ?? {}
    const servers = isRecord(existing.servers) ? existing.servers : {}
    servers.agentils = {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@agent-ils/mcp', '--stdio'],
    }
    await writeFile(mcpPath, JSON.stringify({ ...existing, servers }, null, 2), 'utf8')
    ctx.log.info(
        'JSON merge completed',
        logFields(ctx, {
            operation: 'mergeMcpJson',
            targetPath: mcpPath,
            serverName: 'agentils',
        }),
    )
    return mcpPath
}

function mergeArraysByName(existing: unknown, incoming: unknown[]): unknown[] {
    const existingArray = Array.isArray(existing) ? existing : []
    const isNamedObject = (value: unknown): value is Record<string, unknown> & { name: string } =>
        isRecord(value) && typeof value.name === 'string'
    if (!incoming.every(isNamedObject)) return [...existingArray, ...incoming]

    const byName = new Map<string, unknown>()
    for (const item of existingArray) {
        if (isNamedObject(item)) byName.set(item.name, item)
    }
    const result = [...existingArray]
    for (const nextItem of incoming) {
        const existingItem = byName.get(nextItem.name)
        if (existingItem) {
            const index = result.indexOf(existingItem)
            if (index >= 0) result[index] = nextItem
        } else {
            result.push(nextItem)
        }
    }
    return result
}

function mergeSettingValue(existing: unknown, incoming: unknown): unknown {
    if (Array.isArray(incoming)) return mergeArraysByName(existing, incoming)
    if (existing === undefined) return incoming
    return existing
}

async function injectSettings(ctx: CliContext, settingsPath: string): Promise<string | null> {
    const cfgPath = join(TEMPLATES_DIR, 'config.json')
    if (!existsSync(cfgPath)) return null
    const presets = JSON.parse(await readFile(cfgPath, 'utf8')) as Record<string, unknown>
    await ensureDir(dirname(settingsPath))
    ctx.log.info(
        'JSON merge started',
        logFields(ctx, {
            operation: 'mergeSettings',
            targetPath: settingsPath,
            keys: Object.keys(presets),
        }),
    )
    const existing = (await readJsonIfExists(settingsPath)) ?? {}
    for (const [k, v] of Object.entries(presets)) {
        existing[k] = mergeSettingValue(existing[k], v)
    }
    await writeFile(settingsPath, JSON.stringify(existing, null, 2), 'utf8')
    ctx.log.info(
        'JSON merge completed',
        logFields(ctx, {
            operation: 'mergeSettings',
            targetPath: settingsPath,
            keys: Object.keys(presets),
        }),
    )
    return settingsPath
}

function recordRetainedSettings(ctx: CliContext, settingsPath: string): string | null {
    if (!existsSync(settingsPath)) return null
    ctx.log.info(
        'settings retained',
        logFields(ctx, {
            operation: 'retainSettings',
            targetPath: settingsPath,
            reason: 'preserve user edits',
        }),
    )
    return `AgentILS settings were left in ${settingsPath} to preserve user edits.`
}

async function doInit(ctx: CliContext): Promise<void> {
    const { args } = ctx
    const { prompts, agents } = await listTemplateFiles(ctx)
    const written: string[] = []
    const notices: string[] = []

    if (args.scope === 'user') {
        const promptsDir = userPromptsDir()
        const agentsDir = userAgentsDir()
        for (const f of prompts) written.push(await copyTemplate(ctx, f, 'files', promptsDir))
        for (const f of agents) written.push(await copyTemplate(ctx, f, 'files', agentsDir))
        written.push(...(await copySampleTemplates(ctx, promptsDir, agentsDir)))
        const settings = await injectSettings(ctx, userSettingsPath())
        if (settings) written.push(settings)
        // User-scoped installs rely on the AgentILS VS Code extension activation path to start MCP.
        notices.push(
            'User scope relies on the AgentILS VS Code extension auto-starting its MCP bridge; use --workspace to write .vscode/mcp.json for stdio clients.',
        )
        ctx.log.info(
            'user MCP path documented',
            logFields(ctx, {
                operation: 'documentUserMcpPath',
                mcpPath: 'agentils-vscode auto-start bridge',
            }),
        )
    } else {
        const promptsDir = join(args.workspace, '.github', 'prompts')
        const agentsDir = join(args.workspace, '.github', 'agents')
        for (const f of prompts) written.push(await copyTemplate(ctx, f, 'files', promptsDir))
        for (const f of agents) written.push(await copyTemplate(ctx, f, 'files', agentsDir))
        written.push(...(await copySampleTemplates(ctx, promptsDir, agentsDir)))
        const settings = await injectSettings(ctx, join(args.workspace, '.vscode', 'settings.json'))
        if (settings) written.push(settings)
        written.push(await injectMcpJson(ctx, args.workspace))
    }

    process.stdout.write(`AgentILS installed (${args.scope}). Wrote ${written.length} files:\n`)
    for (const w of written) process.stdout.write(`  + ${w}\n`)
    for (const notice of notices) process.stdout.write(`\n${notice}\n`)
    process.stdout.write(`\nReload VS Code to pick up the new prompts and MCP server.\n`)
}

async function doUninstall(ctx: CliContext): Promise<void> {
    const { args } = ctx
    const { prompts, agents } = await listTemplateFiles(ctx)
    const sampleTemplates = await listSampleTemplates(ctx)
    const notices: string[] = []
    let removed = 0
    const tryUnlink = async (p: string) => {
        if (!existsSync(p)) return
        await rm(p, { force: true })
        removed++
        ctx.log.info(
            'uninstall removal',
            logFields(ctx, {
                operation: 'removeFile',
                targetPath: p,
            }),
        )
    }

    if (args.scope === 'user') {
        const promptsDir = userPromptsDir()
        const agentsDir = userAgentsDir()
        for (const f of prompts) await tryUnlink(join(promptsDir, f))
        for (const f of agents) await tryUnlink(join(agentsDir, f))
        for (const f of agents) await tryUnlink(join(legacyUserAgentsDir(), f))
        for (const f of sampleTemplates.prompts) await tryUnlink(join(promptsDir, f))
        for (const f of sampleTemplates.agents) await tryUnlink(join(agentsDir, f))
        for (const f of sampleTemplates.agents) await tryUnlink(join(legacyUserAgentsDir(), f))
        const retainedSettings = recordRetainedSettings(ctx, userSettingsPath())
        if (retainedSettings) notices.push(retainedSettings)
    } else {
        const promptsDir = join(args.workspace, '.github', 'prompts')
        const agentsDir = join(args.workspace, '.github', 'agents')
        for (const f of prompts) await tryUnlink(join(promptsDir, f))
        for (const f of agents) await tryUnlink(join(agentsDir, f))
        for (const f of sampleTemplates.prompts) await tryUnlink(join(promptsDir, f))
        for (const f of sampleTemplates.agents) await tryUnlink(join(agentsDir, f))
        const mcpPath = join(args.workspace, '.vscode', 'mcp.json')
        const existing = await readJsonIfExists(mcpPath)
        if (existing && isRecord(existing.servers)) {
            ctx.log.info(
                'JSON merge started',
                logFields(ctx, {
                    operation: 'removeMcpServer',
                    targetPath: mcpPath,
                }),
            )
            const servers = existing.servers as Record<string, unknown>
            delete servers.agentils
            await writeFile(mcpPath, JSON.stringify(existing, null, 2), 'utf8')
            ctx.log.info(
                'JSON merge completed',
                logFields(ctx, {
                    operation: 'removeMcpServer',
                    targetPath: mcpPath,
                    serverName: 'agentils',
                }),
            )
        }
        const retainedSettings = recordRetainedSettings(ctx, join(args.workspace, '.vscode', 'settings.json'))
        if (retainedSettings) notices.push(retainedSettings)
    }
    process.stdout.write(`AgentILS uninstalled (${args.scope}). Removed ${removed} files.\n`)
    for (const notice of notices) process.stdout.write(`${notice}\n`)
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2))
    const ctx = createCliContext(args)
    ctx.log.info(
        'command parsed',
        logFields(ctx, {
            operation: 'parseArgs',
            command: args.command,
            argv: process.argv.slice(2),
        }),
    )
    ctx.log.info(
        'scope resolved',
        logFields(ctx, {
            operation: 'resolveScope',
            command: args.command,
        }),
    )
    if (args.command === 'help') {
        process.stdout.write(HELP)
        return
    }
    if (args.command === 'init') return doInit(ctx)
    if (args.command === 'uninstall') return doUninstall(ctx)
}

main().catch((err) => {
    const args = parseArgs(process.argv.slice(2))
    const ctx = createCliContext(args)
    ctx.log.error(
        'CLI command failed',
        logFields(ctx, {
            operation: 'error',
            command: args.command,
            error: {
                name: (err as Error).name,
                message: (err as Error).message,
                stack: (err as Error).stack,
            },
        }),
    )
    process.stderr.write(`agentils: ${(err as Error).message}\n`)
    process.exit(1)
})
