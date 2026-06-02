import { formatFindingMessage, renderJson } from '../lib.mjs'
import { buildNormalizedRuntimeHookEvent, shouldEmitHookOutput } from './shared.mjs'

export function normalizeHookEvent(raw, phaseHint) {
    return buildNormalizedRuntimeHookEvent({
        runtime: 'copilot',
        raw,
        phaseHint: phaseHint ?? raw.hookEventName ?? raw.hook_event_name ?? raw.eventName ?? raw.event_name ?? '',
        toolName: raw.tool_name ?? raw.toolName ?? '',
        toolInput: raw.toolInput ?? {},
    })
}

export function formatHookOutput(event, result) {
    if (!shouldEmitHookOutput(result)) return ''

    const reason = formatFindingMessage(result.primaryFinding)
    if (event.phase === 'pre-tool') {
        return renderJson({
            hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'deny',
                permissionDecisionReason: reason,
            },
            systemMessage: reason,
        })
    }

    if (event.phase === 'stop') {
        return renderJson({
            decision: 'block',
            reason,
            hookSpecificOutput: {
                hookEventName: 'Stop',
                decision: 'block',
                reason,
            },
            systemMessage: reason,
        })
    }

    return ''
}
