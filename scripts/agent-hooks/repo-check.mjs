import { evaluatePolicy } from './engine.mjs'
import { formatFindingMessage, getDiffPaths, getDirtyPaths, instructionsAreSynced } from './lib.mjs'

const phaseArg = process.argv[2] ?? 'ci'
const args = parseArgs(process.argv.slice(3))

main()

function main() {
    const event = buildEvent(phaseArg, args)
    const result = evaluatePolicy(event)

    if (result.decision === 'allow') {
        process.stdout.write(`[agent-hooks] ${phaseArg}: allow\n`)
        return
    }

    process.stderr.write(`[agent-hooks] ${phaseArg}: ${formatFindingMessage(result.primaryFinding)}\n`)
    process.exitCode = 1
}

function buildEvent(phase, cliArgs) {
    if (phase === 'stop') {
        return {
            phase: 'stop',
            runtime: 'repository',
            dirtyFiles: getDirtyPaths(),
            instructionsSynced: instructionsAreSynced(),
            capabilities: ['runtime-stop', 'dirty-files', 'instructions-sync-status'],
        }
    }

    if (phase === 'ci') {
        const changedFiles =
            cliArgs.base && cliArgs.head
                ? getDiffPaths({ base: cliArgs.base, head: cliArgs.head })
                : parseJsonArray(cliArgs['changed-files-json'])
        const addedFiles =
            cliArgs.base && cliArgs.head
                ? getDiffPaths({ base: cliArgs.base, head: cliArgs.head, diffFilter: 'A' })
                : parseJsonArray(cliArgs['added-files-json'])
        return {
            phase: 'ci',
            runtime: 'repository',
            changedFiles,
            addedFiles,
            capabilities: ['repository-ci', 'changed-files', 'added-files'],
        }
    }

    if (phase === 'subagent-stop') {
        return {
            phase: 'subagent-stop',
            runtime: 'subagent',
            role: cliArgs.role,
            runDir: cliArgs['run-dir'],
            changedFiles: parseJsonArray(cliArgs['changed-files-json']),
            capabilities: ['subagent-stop', 'changed-files', 'subagent-role'],
        }
    }

    throw new Error(`Unsupported repo-check phase: ${phase}`)
}

function parseArgs(argv) {
    const parsed = {}
    for (let index = 0; index < argv.length; index += 1) {
        const entry = argv[index]
        if (!entry.startsWith('--')) continue
        const key = entry.slice(2)
        const next = argv[index + 1]
        if (!next || next.startsWith('--')) {
            parsed[key] = 'true'
            continue
        }
        parsed[key] = next
        index += 1
    }
    return parsed
}

function parseJsonArray(value) {
    if (!value) return []
    try {
        const parsed = JSON.parse(value)
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}
