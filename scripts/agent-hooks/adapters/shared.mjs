import { collectCandidatePaths, collectCommandStrings, normalizeHookEventName } from '../lib.mjs'

export function buildNormalizedRuntimeHookEvent({ runtime, phaseHint, raw, toolName, toolInput }) {
    const phase = normalizeHookEventName(phaseHint)
    const patchText = typeof toolInput === 'string' ? toolInput : ''
    const writeTargets = collectCandidatePaths(toolInput)
    const commandTexts = collectCommandStrings(toolInput)
    const capabilities = new Set()

    if (phase === 'pre-tool') capabilities.add('runtime-pre-tool')
    if (phase === 'stop') capabilities.add('runtime-stop')
    if (writeTargets.length) capabilities.add('write-targets')
    if (commandTexts.length) capabilities.add('command-text')
    if (patchText) capabilities.add('patch-text')

    return {
        phase,
        runtime,
        toolName: String(toolName ?? ''),
        toolInput,
        patchText,
        writeTargets,
        commandTexts,
        candidatePaths: writeTargets,
        commandStrings: commandTexts,
        capabilities: [...capabilities],
        raw,
    }
}

export function shouldEmitHookOutput(result) {
    return result.decision === 'deny' || result.decision === 'block'
}
