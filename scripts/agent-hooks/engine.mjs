import { CHECK_STRATEGIES } from './checks.mjs'
import { RULE_REGISTRY } from './rules.mjs'

const DECISION_PRIORITY = {
    allow: 0,
    warn: 1,
    'manual-review': 2,
    deny: 3,
    block: 4,
}

export function evaluatePolicy(event, options = {}) {
    const normalizedEvent = withDerivedCapabilities(event)
    const registry = options.registry ?? RULE_REGISTRY
    const applicableRules = registry.filter((rule) => rule.enforcementPhase === normalizedEvent.phase)
    const findings = []

    for (const rule of applicableRules) {
        if (!capabilitiesApply(rule, normalizedEvent)) continue
        const evaluator = CHECK_STRATEGIES[rule.checkStrategy.kind]
        if (!evaluator) continue
        const match = evaluator(rule, normalizedEvent, options)
        if (!match) continue
        findings.push({
            ruleId: rule.id,
            decision: rule.enforcementLevel,
            failureMessage: withDetail(rule.failureMessage, match.detail),
            fixHint: rule.fixHint,
            sourceDocument: rule.sourceDocument,
            category: rule.category,
            currentType: rule.currentType,
        })
    }

    if (!findings.length) {
        return {
            decision: 'allow',
            findings: [],
            primaryFinding: null,
        }
    }

    const [primaryFinding] = findings.sort(compareFindings)
    return {
        decision: primaryFinding.decision,
        findings,
        primaryFinding,
    }
}

export function summarizeRegistry(registry = RULE_REGISTRY) {
    const summary = new Map()
    for (const rule of registry) {
        const entry = summary.get(rule.category) ?? 0
        summary.set(rule.category, entry + 1)
    }
    return summary
}

function capabilitiesApply(rule, event) {
    if (rule.requiredCapabilitiesAll?.length) {
        const eventCapabilities = new Set(event.capabilities ?? [])
        for (const capability of rule.requiredCapabilitiesAll) {
            if (!eventCapabilities.has(capability)) return false
        }
    }

    if (rule.requiredCapabilitiesAny?.length) {
        const eventCapabilities = new Set(event.capabilities ?? [])
        const hasAny = rule.requiredCapabilitiesAny.some((capability) => eventCapabilities.has(capability))
        if (!hasAny) return false
    }

    if (!rule.applicableRuntime?.length) return true
    if (!event.runtime) return true
    return rule.applicableRuntime.includes(event.runtime)
}

function withDerivedCapabilities(event) {
    const capabilities = new Set(event.capabilities ?? [])

    if (event.phase === 'pre-tool') capabilities.add('runtime-pre-tool')
    if (event.phase === 'stop') capabilities.add('runtime-stop')
    if (event.phase === 'ci') capabilities.add('repository-ci')
    if (event.phase === 'subagent-stop') capabilities.add('subagent-stop')
    if (event.role) capabilities.add('subagent-role')
    if (event.patchText) capabilities.add('patch-text')
    if ((event.writeTargets ?? event.candidatePaths ?? []).length) capabilities.add('write-targets')
    if ((event.commandTexts ?? event.commandStrings ?? []).length) capabilities.add('command-text')
    if ((event.dirtyFiles ?? []).length || 'dirtyFiles' in event) capabilities.add('dirty-files')
    if ((event.changedFiles ?? []).length || 'changedFiles' in event) capabilities.add('changed-files')
    if ((event.addedFiles ?? []).length || 'addedFiles' in event) capabilities.add('added-files')
    if ('instructionsSynced' in event) capabilities.add('instructions-sync-status')

    return {
        ...event,
        capabilities: [...capabilities],
    }
}

function compareFindings(left, right) {
    const severity = DECISION_PRIORITY[right.decision] - DECISION_PRIORITY[left.decision]
    if (severity !== 0) return severity
    return left.ruleId.localeCompare(right.ruleId)
}

function withDetail(message, detail) {
    if (!detail) return message
    return `${message} (${detail}).`
}
