import { evaluatePolicy } from './engine.mjs'
import { getDirtyPaths, inferRuntime, instructionsAreSynced, normalizeHookEventName, readStdinJson } from './lib.mjs'
import * as claudeAdapter from './adapters/claude.mjs'
import * as codexAdapter from './adapters/codex.mjs'
import * as copilotAdapter from './adapters/copilot.mjs'

const eventArg = process.argv[2] ?? ''
const providerArg = process.argv[3] ?? 'any'

const ADAPTERS = {
    claude: claudeAdapter,
    codex: codexAdapter,
    copilot: copilotAdapter,
}

main()

function main() {
    const raw = readStdinJson()
    const runtime = providerArg !== 'any' ? providerArg : inferRuntime(raw)
    const adapter = ADAPTERS[runtime]
    if (!adapter) return

    const phase = normalizeHookEventName(eventArg || raw.hookEventName || raw.hook_event_name || '')
    if (phase !== 'pre-tool' && phase !== 'stop') return

    const baseEvent = adapter.normalizeHookEvent(raw, phase)
    const event = enrichEvent(baseEvent)
    const result = evaluatePolicy(event)
    const output = adapter.formatHookOutput(event, result)
    if (output) process.stdout.write(output)
}

function enrichEvent(event) {
    if (event.phase !== 'stop') return event
    const dirtyFiles = getDirtyPaths()
    return {
        ...event,
        dirtyFiles,
        instructionsSynced: instructionsAreSynced(),
        capabilities: [...new Set([...(event.capabilities ?? []), 'dirty-files', 'instructions-sync-status'])],
    }
}
