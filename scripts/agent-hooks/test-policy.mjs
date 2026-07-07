import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

import * as claudeAdapter from './adapters/claude.mjs'
import * as codexAdapter from './adapters/codex.mjs'
import * as copilotAdapter from './adapters/copilot.mjs'
import { evaluatePolicy } from './engine.mjs'
import { repoRoot } from './lib.mjs'
import { RULE_CATEGORIES, RULE_DISCOVERY_SOURCES, RULE_REGISTRY } from './rules.mjs'

test('registry loads with unique rule ids and supported categories', () => {
    const ids = new Set()
    for (const rule of RULE_REGISTRY) {
        assert.ok(RULE_CATEGORIES.includes(rule.category), `unsupported category for ${rule.id}`)
        assert.ok(!ids.has(rule.id), `duplicate rule id ${rule.id}`)
        ids.add(rule.id)
    }
})

test('every source excerpt still exists in its source document', async () => {
    const fs = await import('node:fs')
    for (const source of RULE_DISCOVERY_SOURCES) {
        assert.ok(fs.existsSync(new URL(`../../${source}`, import.meta.url)), `missing discovery source ${source}`)
    }
    for (const rule of RULE_REGISTRY) {
        const absolute = new URL(`../../${rule.sourceDocument}`, import.meta.url)
        const content = fs.readFileSync(absolute, 'utf8')
        assert.ok(content.includes(rule.originalGuidance), `missing guidance excerpt for ${rule.id}`)
    }
})

test('pre-tool enforcement denies generated target writes', () => {
    const result = evaluatePolicy({
        phase: 'pre-tool',
        runtime: 'codex',
        candidatePaths: ['AGENTS.md'],
        commandStrings: [],
    })
    assert.equal(result.decision, 'deny')
    assert.equal(result.primaryFinding.ruleId, 'agent.generated-targets.edit-source-only')
})

test('codex raw apply_patch payload extracts protected target paths', () => {
    const raw = {
        tool_name: 'apply_patch',
        tool_input: '*** Begin Patch\n*** Update File: AGENTS.md\n@@\n-test\n+test\n*** End Patch\n',
    }
    const event = codexAdapter.normalizeHookEvent(raw, 'pre-tool')
    assert.deepEqual(event.candidatePaths, ['AGENTS.md'])

    const result = evaluatePolicy(event)
    assert.equal(result.decision, 'deny')
    assert.equal(result.primaryFinding.ruleId, 'agent.generated-targets.edit-source-only')
})

test('codex raw apply_patch payload blocks move-to generated targets', () => {
    const raw = {
        tool_name: 'apply_patch',
        tool_input:
            '*** Begin Patch\n*** Update File: docs/notes.md\n*** Move to: AGENTS.md\n@@\n-old\n+new\n*** End Patch\n',
    }
    const event = codexAdapter.normalizeHookEvent(raw, 'pre-tool')
    assert.ok(event.capabilities.includes('patch-text'))
    assert.ok(event.capabilities.includes('write-targets'))
    assert.ok(event.writeTargets.includes('AGENTS.md'))

    const result = evaluatePolicy(event)
    assert.equal(result.decision, 'deny')
    assert.equal(result.primaryFinding.ruleId, 'agent.generated-targets.edit-source-only')
})

test('pre-tool enforcement denies hook bypass commands', () => {
    const result = evaluatePolicy({
        phase: 'pre-tool',
        runtime: 'claude',
        candidatePaths: [],
        commandStrings: ['git commit --no-verify -m "skip hooks"'],
    })
    assert.equal(result.decision, 'deny')
    assert.equal(result.primaryFinding.ruleId, 'git.hook-bypass.forbidden')
})

test('pre-tool allow sample stays allowed', () => {
    const result = evaluatePolicy({
        phase: 'pre-tool',
        runtime: 'copilot',
        candidatePaths: ['docs/instructions/agentils.instructions.md'],
        commandStrings: ['pnpm test:agent-hooks'],
    })
    assert.equal(result.decision, 'allow')
})

test('stop enforcement blocks unsynced instruction changes', () => {
    const result = evaluatePolicy({
        phase: 'stop',
        runtime: 'codex',
        dirtyFiles: ['docs/instructions/agentils.instructions.md'],
        instructionsSynced: false,
    })
    assert.equal(result.decision, 'block')
    assert.equal(result.primaryFinding.ruleId, 'instructions.sync.required-before-stop')
})

test('stop enforcement blocks single-sided README changes', () => {
    const result = evaluatePolicy({
        phase: 'stop',
        runtime: 'claude',
        dirtyFiles: ['README.md'],
        instructionsSynced: true,
    })
    assert.equal(result.decision, 'block')
    assert.equal(result.primaryFinding.ruleId, 'docs.readme-pair.sync-required')
})

test('stop allow sample accepts paired README changes', () => {
    const result = evaluatePolicy({
        phase: 'stop',
        runtime: 'copilot',
        dirtyFiles: ['README.md', 'README.zh-CN.md'],
        instructionsSynced: true,
    })
    assert.equal(result.decision, 'allow')
})

test('stop enforcement ignores internal single-language readme files outside bilingual scope', () => {
    const result = evaluatePolicy({
        phase: 'stop',
        runtime: 'codex',
        dirtyFiles: ['packages/quality-gate/preview/README.md'],
        instructionsSynced: true,
    })
    assert.equal(result.decision, 'allow')
})

test('stop enforcement covers bilingual docs linked from root readmes', () => {
    const result = evaluatePolicy({
        phase: 'stop',
        runtime: 'codex',
        dirtyFiles: ['docs/developer/ci-release-pipeline.md'],
        instructionsSynced: true,
        capabilities: ['runtime-stop', 'dirty-files', 'instructions-sync-status'],
    })
    assert.equal(result.decision, 'block')
    assert.equal(result.primaryFinding.ruleId, 'docs.readme-pair.sync-required')
})

test('subagent-stop enforcement blocks product source edits', () => {
    const result = evaluatePolicy({
        phase: 'subagent-stop',
        runtime: 'subagent',
        role: 'product',
        runDir: 'scripts/ralph/runs/demo',
        changedFiles: ['scripts/ralph/runs/demo/handoff/product.md', 'packages/mcp/src/index.ts'],
    })
    assert.equal(result.decision, 'block')
    assert.equal(result.primaryFinding.ruleId, 'subagent.product.read-only-scope')
})

test('subagent-stop enforcement blocks foreign handoff edits', () => {
    const result = evaluatePolicy({
        phase: 'subagent-stop',
        runtime: 'subagent',
        role: 'developer',
        runDir: 'scripts/ralph/runs/demo',
        changedFiles: ['scripts/ralph/runs/demo/handoff/tester.md', 'packages/mcp/src/index.ts'],
    })
    assert.equal(result.decision, 'block')
    assert.equal(result.primaryFinding.ruleId, 'subagent.handoff.owner-only')
})

test('CI enforcement blocks publishable package changes without changeset', () => {
    const result = evaluatePolicy({
        phase: 'ci',
        runtime: 'repository',
        eventName: 'pull_request',
        changedFiles: ['packages/logger/src/index.ts'],
        addedFiles: [],
    })
    assert.equal(result.decision, 'block')
    assert.equal(result.primaryFinding.ruleId, 'ci.publishable-package.requires-changeset')
})

test('CI allow sample accepts publishable package changes with changeset', () => {
    const result = evaluatePolicy({
        phase: 'ci',
        runtime: 'repository',
        eventName: 'pull_request',
        changedFiles: ['packages/logger/src/index.ts', '.changeset/logger-change.md'],
        addedFiles: ['.changeset/logger-change.md'],
    })
    assert.equal(result.decision, 'allow')
})

test('CI enforcement treats logger collector changes as logger release scope', () => {
    const result = evaluatePolicy({
        phase: 'ci',
        runtime: 'repository',
        eventName: 'pull_request',
        changedFiles: ['packages/logger-collector/main.go'],
        addedFiles: [],
    })
    assert.equal(result.decision, 'block')
    assert.equal(result.primaryFinding.ruleId, 'ci.publishable-package.requires-changeset')
})

test('CI enforcement accepts logger collector changes with changeset', () => {
    const result = evaluatePolicy({
        phase: 'ci',
        runtime: 'repository',
        eventName: 'pull_request',
        changedFiles: ['packages/logger-collector/main.go', '.changeset/logger-collector.md'],
        addedFiles: ['.changeset/logger-collector.md'],
    })
    assert.equal(result.decision, 'allow')
})

test('CI enforcement keeps changeset gate off main release pushes', () => {
    const result = evaluatePolicy({
        phase: 'ci',
        runtime: 'repository',
        eventName: 'push',
        changedFiles: ['packages/logger/package.json', 'packages/logger/CHANGELOG.md'],
        addedFiles: [],
    })
    assert.equal(result.decision, 'allow')
})

test('CI enforcement covers workflow-sdk as a publishable package', () => {
    const result = evaluatePolicy({
        phase: 'ci',
        runtime: 'repository',
        eventName: 'pull_request',
        changedFiles: ['packages/workflow-sdk/src/index.ts'],
        addedFiles: [],
    })
    assert.equal(result.decision, 'block')
    assert.equal(result.primaryFinding.ruleId, 'ci.publishable-package.requires-changeset')
})

test('runtime adapters expose capability-based normalized events', () => {
    const codexEvent = codexAdapter.normalizeHookEvent(
        { tool_name: 'Bash', tool_input: { cmd: 'git status' } },
        'pre-tool',
    )
    assert.ok(codexEvent.capabilities.includes('runtime-pre-tool'))
    assert.ok(codexEvent.capabilities.includes('command-text'))

    const claudeEvent = claudeAdapter.normalizeHookEvent({ hook_event_name: 'Stop' }, 'stop')
    assert.ok(claudeEvent.capabilities.includes('runtime-stop'))

    const copilotEvent = copilotAdapter.normalizeHookEvent(
        { hookEventName: 'PreToolUse', toolInput: { filePath: 'README.md' } },
        'pre-tool',
    )
    assert.ok(copilotEvent.capabilities.includes('write-targets'))
})

test('equivalent provider payloads normalize to the same semantic write targets', () => {
    const codexEvent = codexAdapter.normalizeHookEvent(
        { tool_name: 'Edit', tool_input: { filePath: 'README.md' } },
        'pre-tool',
    )
    const claudeEvent = claudeAdapter.normalizeHookEvent(
        { tool_name: 'Edit', tool_input: { filePath: 'README.md' } },
        'pre-tool',
    )
    const copilotEvent = copilotAdapter.normalizeHookEvent(
        { toolName: 'Edit', toolInput: { filePath: 'README.md' } },
        'pre-tool',
    )

    assert.deepEqual(codexEvent.writeTargets, ['README.md'])
    assert.deepEqual(claudeEvent.writeTargets, ['README.md'])
    assert.deepEqual(copilotEvent.writeTargets, ['README.md'])
    assert.deepEqual([...codexEvent.capabilities].sort(), [...claudeEvent.capabilities].sort())
})

test('common runtime hook rules stay capability-scoped instead of provider-scoped', () => {
    const commonRuntimeRules = RULE_REGISTRY.filter(
        (rule) =>
            rule.currentType === 'runtime-enforced' &&
            (rule.enforcementPhase === 'pre-tool' || rule.enforcementPhase === 'stop'),
    )

    assert.ok(commonRuntimeRules.length > 0)
    for (const rule of commonRuntimeRules) {
        assert.ok(!rule.applicableRuntime?.length, `common runtime rule must not hardcode providers: ${rule.id}`)
    }
})

test('policy entrypoint blocks codex apply_patch move-to payload end-to-end', () => {
    const payload = {
        tool_name: 'apply_patch',
        tool_input:
            '*** Begin Patch\n*** Update File: docs/notes.md\n*** Move to: AGENTS.md\n@@\n-old\n+new\n*** End Patch\n',
    }
    const output = execFileSync('node', ['scripts/agent-hooks/policy.mjs', 'pretooluse', 'codex'], {
        cwd: repoRoot,
        input: JSON.stringify(payload),
        encoding: 'utf8',
    })
    const parsed = JSON.parse(output)
    assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny')
    assert.match(parsed.systemMessage, /generated agent targets/i)
})

test('shared policy entrypoint produces the same protected-write verdict across runtimes', () => {
    const scenarios = [
        ['codex', { tool_name: 'Edit', tool_input: { filePath: 'AGENTS.md' } }],
        ['claude', { tool_name: 'Edit', tool_input: { filePath: 'AGENTS.md' } }],
        ['copilot', { toolName: 'Edit', toolInput: { filePath: 'AGENTS.md' } }],
    ]

    const reasons = scenarios.map(([runtime, payload]) => {
        const output = execFileSync('node', ['scripts/agent-hooks/policy.mjs', 'pretooluse', runtime], {
            cwd: repoRoot,
            input: JSON.stringify(payload),
            encoding: 'utf8',
        })
        const parsed = JSON.parse(output)
        assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny')
        return parsed.hookSpecificOutput.permissionDecisionReason
    })

    assert.equal(new Set(reasons).size, 1)
    assert.match(reasons[0], /generated agent targets/i)
})

test('repo-check entrypoint blocks linked bilingual docs drift end-to-end', () => {
    let stdout = ''
    try {
        execFileSync(
            'node',
            [
                'scripts/agent-hooks/repo-check.mjs',
                'ci',
                '--changed-files-json',
                '["docs/developer/ci-release-pipeline.md"]',
                '--added-files-json',
                '[]',
            ],
            {
                cwd: repoRoot,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe'],
            },
        )
    } catch (error) {
        stdout = String(error.stderr || error.stdout || '')
    }
    assert.match(stdout, /paired change/i)
})

test('generic runtime with matching capabilities still triggers common runtime rules', () => {
    const result = evaluatePolicy({
        phase: 'pre-tool',
        runtime: 'cursor',
        capabilities: ['runtime-pre-tool', 'write-targets'],
        writeTargets: ['AGENTS.md'],
        candidatePaths: ['AGENTS.md'],
        commandStrings: [],
    })
    assert.equal(result.decision, 'deny')
    assert.equal(result.primaryFinding.ruleId, 'agent.generated-targets.edit-source-only')
})

test('all configured runtime hooks point to the shared policy entrypoint', async () => {
    const fs = await import('node:fs')
    const codex = JSON.parse(fs.readFileSync(new URL('../../.codex/hooks.json', import.meta.url), 'utf8'))
    const claude = JSON.parse(fs.readFileSync(new URL('../../.claude/settings.json', import.meta.url), 'utf8'))
    const copilot = JSON.parse(
        fs.readFileSync(new URL('../../.github/hooks/agent-enforcement.json', import.meta.url), 'utf8'),
    )

    assert.equal(codex.hooks.PreToolUse[0].hooks[0].command, 'node scripts/agent-hooks/policy.mjs pretooluse codex')
    assert.equal(codex.hooks.Stop[0].hooks[0].command, 'node scripts/agent-hooks/policy.mjs stop codex')
    assert.equal(claude.hooks.PreToolUse[0].hooks[0].command, 'node scripts/agent-hooks/policy.mjs pretooluse claude')
    assert.equal(claude.hooks.Stop[0].hooks[0].command, 'node scripts/agent-hooks/policy.mjs stop claude')
    assert.equal(copilot.hooks.PreToolUse[0].command, 'node scripts/agent-hooks/policy.mjs pretooluse copilot')
    assert.equal(copilot.hooks.Stop[0].command, 'node scripts/agent-hooks/policy.mjs stop copilot')
})

test('guidance-only rules are not misrepresented as enforced checks', () => {
    const enforcedPhases = new Set(['pre-tool', 'stop', 'subagent-stop', 'ci', 'git-hook'])
    const guidanceRules = RULE_REGISTRY.filter((rule) => rule.category === 'guidance-only')
    assert.ok(guidanceRules.length > 0)
    for (const rule of guidanceRules) {
        assert.ok(!enforcedPhases.has(rule.enforcementPhase))
        assert.equal(rule.currentStatus, 'guidance-only')
    }
})

test('runtime adapters keep provider-specific output isolated', () => {
    const event = {
        phase: 'pre-tool',
        runtime: 'codex',
        candidatePaths: ['AGENTS.md'],
        commandStrings: [],
    }
    const result = evaluatePolicy(event)

    const codexOutput = JSON.parse(codexAdapter.formatHookOutput(event, result))
    assert.equal(codexOutput.hookSpecificOutput.permissionDecision, 'deny')
    assert.equal(codexOutput.decision, 'block')

    const claudeOutput = JSON.parse(claudeAdapter.formatHookOutput({ ...event, runtime: 'claude' }, result))
    assert.equal(claudeOutput.hookSpecificOutput.permissionDecision, 'deny')
    assert.equal('decision' in claudeOutput, false)

    const copilotOutput = JSON.parse(copilotAdapter.formatHookOutput({ ...event, runtime: 'copilot' }, result))
    assert.equal(copilotOutput.hookSpecificOutput.permissionDecision, 'deny')
    assert.equal('decision' in copilotOutput, false)
})

test('repo root stays stable for generated artifacts and checks', () => {
    assert.ok(repoRoot.endsWith('/AgentILS'))
})
