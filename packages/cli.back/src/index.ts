/* eslint-disable no-console */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

export type InstallTarget = 'vscode'
export type InstallScope = 'workspace' | 'user' | 'both'

export interface CliOptions {
    command: 'install' | 'uninstall' | 'help'
    target: InstallTarget
    workspaceRoot: string
    scope: InstallScope
    dryRun: boolean
}

export interface PromptPackFile {
    relativePath: string
    content: string
}

export interface ChangeRecord {
    kind: 'write' | 'delete' | 'skip'
    path: string
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const legacyWorkspaceFiles = [
    '.github/agents/agentils.orchestrator.agent.md',
    '.github/prompts/agentils.run-task.prompt.md',
    '.github/prompts/agentils.run-code.prompt.md',
    '.github/prompts/agentils.approval.prompt.md',
    '.github/prompts/agentils.feedback.prompt.md',
    '.github/prompts/startnewtask.prompt.md',
]
const legacyUserFiles = [
    join(homedir(), '.copilot', 'agents', 'agentils.orchestrator.agent.md'),
    join(homedir(), '.copilot', 'prompts', 'agentils.run-task.prompt.md'),
    join(homedir(), '.copilot', 'prompts', 'agentils.run-code.prompt.md'),
    join(homedir(), '.copilot', 'prompts', 'agentils.approval.prompt.md'),
    join(homedir(), '.copilot', 'prompts', 'agentils.feedback.prompt.md'),
    join(homedir(), '.copilot', 'prompts', 'startnewtask.prompt.md'),
]

export function parseArgs(argv: string[]): CliOptions {
    if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
        return {
            command: 'help',
            target: 'vscode',
            workspaceRoot: resolve(process.cwd()),
            scope: 'workspace',
            dryRun: false,
        }
    }

    const [command, target, ...rest] = argv
    if (command !== 'install' && command !== 'uninstall') {
        throw new Error(`Unsupported command: ${command}`)
    }
    if (target !== 'vscode') {
        throw new Error(`Unsupported target: ${target}`)
    }

    let workspaceRoot = resolve(process.cwd())
    let scope: InstallScope = 'workspace'
    let dryRun = false

    for (let index = 0; index < rest.length; index += 1) {
        const token = rest[index]
        if (token === '--workspace') {
            const value = rest[index + 1]
            if (!value) {
                throw new Error('Missing value for --workspace')
            }
            workspaceRoot = resolve(value)
            index += 1
            continue
        }
        if (token === '--scope') {
            const value = rest[index + 1]
            if (value !== 'workspace' && value !== 'user' && value !== 'both') {
                throw new Error('--scope must be workspace, user, or both')
            }
            scope = value
            index += 1
            continue
        }
        if (token === '--dry-run') {
            dryRun = true
            continue
        }
        throw new Error(`Unknown argument: ${token}`)
    }

    return { command, target, workspaceRoot, scope, dryRun }
}

export function loadVsCodePromptPack(): PromptPackFile[] {
    const templatesRoot = join(packageRoot, 'templates', 'vscode')
    return [
        {
            relativePath: '.github/agents/agentils.loop.agent.md',
            content: readNormalized(join(templatesRoot, 'agents', 'agentils.loop.agent.md')),
        },
        {
            relativePath: '.github/prompts/runtask.prompt.md',
            content: readNormalized(join(templatesRoot, 'prompts', 'runTask.prompt.md')),
        },
        {
            relativePath: '.github/prompts/runTask.prompt.md',
            content: readNormalized(join(templatesRoot, 'prompts', 'runTask.prompt.md')),
        },
        // PR-E: stage envelope 字段契约（让 LLM 按 5 节点结构化填 reply）
        {
            relativePath: '.github/instructions/agentils-stage-envelope-contract.instructions.md',
            content: readNormalized(join(templatesRoot, 'instructions', 'stage-envelope-contract.md')),
        },
    ]
}

export function installVsCodeAssets(options: {
    workspaceRoot: string
    scope?: InstallScope
    dryRun?: boolean
}): ChangeRecord[] {
    const scope = options.scope ?? 'workspace'
    const dryRun = options.dryRun ?? false
    const changes: ChangeRecord[] = []
    const promptPack = loadVsCodePromptPack()

    if (scope === 'workspace' || scope === 'both') {
        for (const relativePath of legacyWorkspaceFiles) {
            removeFile(join(options.workspaceRoot, relativePath), changes, dryRun)
        }
        for (const file of promptPack) {
            writeTextFile(join(options.workspaceRoot, file.relativePath), file.content, changes, dryRun)
        }
        // Phase 2 (Plan C): mcp.json now points to a long-lived HTTP MCP server
        // started by the AgentILS VS Code extension (or `pnpm --filter @agent-ils/mcp start`).
        // Both Copilot and the extension connect to the same HTTP endpoint, so the
        // store is the single source of truth.
        const mcpHttpPort = Number(process.env.AGENTILS_HTTP_PORT) || 8788
        const mcpHttpHost = process.env.AGENTILS_HTTP_HOST ?? '127.0.0.1'
        writeJsonFile(
            join(options.workspaceRoot, '.vscode', 'mcp.json'),
            {
                servers: {
                    agentils: {
                        type: 'http',
                        url: `http://${mcpHttpHost}:${mcpHttpPort}/mcp`,
                    },
                },
            },
            changes,
            dryRun,
        )
    }

    if (scope === 'user' || scope === 'both') {
        for (const path of legacyUserFiles) {
            removeFile(path, changes, dryRun)
        }
        for (const file of promptPack) {
            const destination = file.relativePath.includes('/agents/')
                ? join(homedir(), '.copilot', 'agents', 'agentils.loop.agent.md')
                : file.relativePath.includes('/instructions/')
                  ? join(homedir(), '.copilot', 'instructions', 'agentils-stage-envelope-contract.instructions.md')
                  : join(homedir(), '.copilot', 'prompts', 'runTask.prompt.md')
            writeTextFile(destination, file.content, changes, dryRun)
        }
    }

    return changes
}

export function uninstallVsCodeAssets(options: {
    workspaceRoot: string
    scope?: InstallScope
    dryRun?: boolean
}): ChangeRecord[] {
    const scope = options.scope ?? 'workspace'
    const dryRun = options.dryRun ?? false
    const changes: ChangeRecord[] = []
    const workspaceTargets = [
        '.github/agents/agentils.loop.agent.md',
        '.github/prompts/runtask.prompt.md',
        '.github/prompts/runTask.prompt.md',
        '.github/instructions/agentils-stage-envelope-contract.instructions.md',
        '.vscode/mcp.json',
    ]
    const userTargets = [
        join(homedir(), '.copilot', 'agents', 'agentils.loop.agent.md'),
        join(homedir(), '.copilot', 'prompts', 'runtask.prompt.md'),
        join(homedir(), '.copilot', 'prompts', 'runTask.prompt.md'),
        join(homedir(), '.copilot', 'instructions', 'agentils-stage-envelope-contract.instructions.md'),
    ]

    if (scope === 'workspace' || scope === 'both') {
        for (const relativePath of workspaceTargets) {
            removeFile(join(options.workspaceRoot, relativePath), changes, dryRun)
        }
    }
    if (scope === 'user' || scope === 'both') {
        for (const path of userTargets) {
            removeFile(path, changes, dryRun)
        }
    }

    return changes
}

export async function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv)
    if (options.command === 'help') {
        printHelp()
        return
    }

    const changes = options.command === 'install' ? installVsCodeAssets(options) : uninstallVsCodeAssets(options)

    for (const change of changes) {
        console.log(`[agentils] ${change.kind}: ${change.path}`)
    }
}

const invokedPath = process.argv[1] ?? ''
const isDirectEntrypoint =
    invokedPath.endsWith('/dist/index.js') ||
    invokedPath.endsWith('\\dist\\index.js') ||
    invokedPath.endsWith('/src/index.ts') ||
    invokedPath.endsWith('\\src\\index.ts') ||
    invokedPath === 'dist/index.js' ||
    invokedPath === 'src/index.ts'

if (isDirectEntrypoint) {
    void main().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error))
        process.exitCode = 1
    })
}

function writeTextFile(path: string, content: string, changes: ChangeRecord[], dryRun: boolean) {
    const current = existsSync(path) ? readFileSync(path, 'utf8') : null
    if (current === content) {
        changes.push({ kind: 'skip', path })
        return
    }
    changes.push({ kind: 'write', path })
    if (dryRun) {
        return
    }
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content, 'utf8')
}

function writeJsonFile(path: string, value: unknown, changes: ChangeRecord[], dryRun: boolean) {
    writeTextFile(path, `${JSON.stringify(value, null, 2)}\n`, changes, dryRun)
}

function removeFile(path: string, changes: ChangeRecord[], dryRun: boolean) {
    if (!existsSync(path)) {
        changes.push({ kind: 'skip', path })
        return
    }
    changes.push({ kind: 'delete', path })
    if (!dryRun) {
        rmSync(path, { force: true })
    }
}

function readNormalized(path: string) {
    return readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
}

function printHelp() {
    console.log(`AgentILS CLI

Usage:
  agentils install vscode [--workspace <path>] [--scope <workspace|user|both>] [--dry-run]
  agentils uninstall vscode [--workspace <path>] [--scope <workspace|user|both>] [--dry-run]
`)
}
