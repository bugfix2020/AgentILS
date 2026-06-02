import {
    fileExists,
    globToRegExp,
    normalizeRepoPath,
    repoRoot,
    resolvePathFromRepo,
    safeRelativeToRepo,
    isWithinPath,
} from './lib.mjs'
import fs from 'node:fs'
import path from 'node:path'

const GENERATED_TARGET_FILES = new Set(['AGENTS.md', 'CLAUDE.md', '.github/copilot-instructions.md'])
const GENERATED_TARGET_DIRS = [
    '.github/instructions',
    '.github/skills',
    '.github/agents',
    '.agents/skills',
    '.claude/skills',
    '.claude/agents',
    '.codex/agents',
]
const INSTRUCTION_SOURCES = [
    'docs/instructions/',
    'docs/skills/',
    'docs/agents/',
    'docs/instructions/sync-manifest.json',
    'scripts/dev/sync-agent-instructions.mjs',
]

const COMMAND_PATTERN_SETS = {
    'hook-bypass': [
        /--no-verify\b/,
        /\bHUSKY=0\b/,
        /\bcore\.hooksPath=\/dev\/null\b/,
        /\bCLAUDE_CODE_DISABLE_AUTO_MEMORY=0\b/,
    ],
}

export const CHECK_STRATEGIES = {
    'protected-write-target': checkProtectedWriteTarget,
    'command-pattern': checkCommandPattern,
    'instruction-sync': checkInstructionSync,
    'readme-pair': checkReadmePair,
    'changeset-required': checkChangesetRequired,
    'subagent-role-allowlist': checkSubagentRoleAllowlist,
    'subagent-owned-handoff': checkSubagentOwnedHandoff,
    'external-script': () => null,
    'not-machine-checkable': () => null,
}

function checkProtectedWriteTarget(rule, event) {
    for (const candidate of event.candidatePaths ?? []) {
        const blockedTarget = matchProtectedPath(candidate, rule.checkStrategy)
        if (!blockedTarget) continue
        return { detail: blockedTarget }
    }

    for (const command of event.commandStrings ?? []) {
        const hint = (rule.checkStrategy.commandHints ?? []).find((candidate) => command.includes(candidate))
        if (hint) return { detail: hint }
    }

    return null
}

function checkCommandPattern(rule, event) {
    const patterns = COMMAND_PATTERN_SETS[rule.checkStrategy.patternSet] ?? []
    for (const command of event.commandStrings ?? []) {
        const match = patterns.find((pattern) => pattern.test(command))
        if (match) return { detail: match.source }
    }
    return null
}

function checkInstructionSync(rule, event) {
    const dirtyFiles = event.dirtyFiles ?? []
    const sourceDirty = dirtyFiles.some(matchesInstructionSource)
    const generatedDirty = dirtyFiles.some(isGeneratedTarget)

    if (rule.checkStrategy.mode === 'generated-targets-require-source') {
        if (generatedDirty && !sourceDirty) {
            return { detail: dirtyFiles.filter(isGeneratedTarget).join(', ') }
        }
        return null
    }

    if (rule.checkStrategy.mode === 'source-changes-require-sync') {
        if (sourceDirty && event.instructionsSynced === false) {
            return { detail: dirtyFiles.filter(matchesInstructionSource).join(', ') }
        }
        return null
    }

    return null
}

function checkReadmePair(rule, event) {
    const files = rule.checkStrategy.source === 'dirty-files' ? (event.dirtyFiles ?? []) : (event.changedFiles ?? [])
    const changedSet = new Set(files.map(normalizeRepoPath))
    const pairMap = getBilingualPairMap()

    for (const file of changedSet) {
        const counterpart = pairMap.get(file)
        if (!counterpart) continue
        if (changedSet.has(counterpart)) continue
        return { detail: `${file}: missing paired change for ${counterpart}` }
    }

    return null
}

function checkChangesetRequired(rule, event) {
    const changedFiles = event.changedFiles ?? []
    const publishablePackages = new Set(rule.checkStrategy.publishablePackages ?? [])
    const publishableDirs = getPublishablePackageDirs(publishablePackages)
    const touchedPublishableDirs = changedFiles.filter((file) =>
        publishableDirs.some((dir) => file === dir || file.startsWith(`${dir}/`)),
    )
    if (!touchedPublishableDirs.length) return null

    const addedFiles = event.addedFiles ?? []
    const hasChangeset = addedFiles.some(
        (file) => file.startsWith('.changeset/') && file.endsWith('.md') && file !== '.changeset/README.md',
    )
    if (hasChangeset) return null

    return { detail: touchedPublishableDirs.join(', ') }
}

function checkSubagentRoleAllowlist(rule, event) {
    if (event.role !== rule.checkStrategy.role) return null
    const matcher = buildPatternMatcher(rule.checkStrategy.allowedPatterns ?? [], event.runDir)
    for (const file of event.changedFiles ?? []) {
        if (!matcher(file)) {
            return { detail: file }
        }
    }
    return null
}

function checkSubagentOwnedHandoff(rule, event) {
    const role = event.role
    const runDir = normalizeRepoPath(event.runDir ?? '')
    if (!role || !runDir) return null

    const handoffPrefix = `${runDir}/handoff/`
    const ownHandoff = `${handoffPrefix}${role}.md`
    for (const file of event.changedFiles ?? []) {
        if (!normalizeRepoPath(file).startsWith(handoffPrefix)) continue
        if (normalizeRepoPath(file) !== ownHandoff) {
            return { detail: file }
        }
    }
    return null
}

function buildPatternMatcher(patterns, runDir) {
    const compiled = patterns.map((pattern) => {
        const expanded = normalizeRepoPath(String(pattern).replaceAll('{RUN_DIR}', normalizeRepoPath(runDir ?? '')))
        return globToRegExp(expanded)
    })
    return (candidate) => {
        const normalized = normalizeRepoPath(candidate)
        return compiled.some((pattern) => pattern.test(normalized))
    }
}

function getPublishablePackageDirs(packageNames) {
    const packagesDir = path.join(repoRoot, 'packages')
    if (!fs.existsSync(packagesDir)) return []

    const dirs = []
    for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const packageJsonPath = path.join(packagesDir, entry.name, 'package.json')
        if (!fs.existsSync(packageJsonPath)) continue
        try {
            const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
            if (pkg.private === true) continue
            if (!packageNames.has(pkg.name)) continue
            dirs.push(normalizeRepoPath(`packages/${entry.name}`))
        } catch {
            continue
        }
    }
    return dirs
}

function getBilingualPairMap() {
    const pairs = new Map()
    for (const readme of getUserFacingReadmeFiles()) {
        const counterpart = getZhCounterpart(readme) ?? getEnCounterpart(readme)
        if (counterpart && fileExists(counterpart)) addPair(pairs, readme, counterpart)
    }

    for (const readme of getUserFacingReadmeFiles()) {
        const absolute = path.join(repoRoot, readme)
        if (!fs.existsSync(absolute)) continue
        const content = fs.readFileSync(absolute, 'utf8')
        const dir = path.posix.dirname(readme)
        for (const linkTarget of extractMarkdownTargets(content)) {
            const resolved = normalizeLinkedDocPath(dir, linkTarget)
            if (!resolved) continue
            const counterpart = getZhCounterpart(resolved) ?? getEnCounterpart(resolved)
            if (!counterpart || !fileExists(counterpart)) continue
            addPair(pairs, resolved, counterpart)
        }
    }

    return pairs
}

function getUserFacingReadmeFiles() {
    const files = ['README.md', 'README.zh-CN.md']
    const packagesDir = path.join(repoRoot, 'packages')
    if (!fs.existsSync(packagesDir)) return files

    for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const base = `packages/${entry.name}`
        const readme = `${base}/README.md`
        const readmeZh = `${base}/README.zh-CN.md`
        if (fileExists(readme)) files.push(readme)
        if (fileExists(readmeZh)) files.push(readmeZh)
    }
    return files
}

function extractMarkdownTargets(content) {
    const targets = []
    const pattern = /\[[^\]]+\]\(([^)#]+)(?:#[^)]+)?\)/g
    for (const match of content.matchAll(pattern)) {
        const target = String(match[1] ?? '').trim()
        if (target) targets.push(target)
    }
    return targets
}

function normalizeLinkedDocPath(readmeDir, target) {
    if (/^[a-z]+:/i.test(target)) return null
    if (!target.endsWith('.md')) return null
    const resolved = normalizeRepoPath(path.posix.normalize(path.posix.join(readmeDir, target)))
    if (!resolved.startsWith('docs/')) return null
    return resolved
}

function getZhCounterpart(file) {
    if (file.endsWith('.zh-CN.md')) return null
    return file.replace(/\.md$/, '.zh-CN.md')
}

function getEnCounterpart(file) {
    if (!file.endsWith('.zh-CN.md')) return null
    return file.replace(/\.zh-CN\.md$/, '.md')
}

function addPair(map, left, right) {
    const normalizedLeft = normalizeRepoPath(left)
    const normalizedRight = normalizeRepoPath(right)
    map.set(normalizedLeft, normalizedRight)
    map.set(normalizedRight, normalizedLeft)
}

function matchesInstructionSource(file) {
    const normalized = normalizeRepoPath(file)
    return INSTRUCTION_SOURCES.some((prefix) => normalized === prefix || normalized.startsWith(prefix))
}

function isGeneratedTarget(file) {
    const normalized = normalizeRepoPath(file)
    if (GENERATED_TARGET_FILES.has(normalized)) return true
    return GENERATED_TARGET_DIRS.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))
}

function matchProtectedPath(candidate, strategy) {
    const resolved = resolvePathFromRepo(candidate)
    if (!resolved) return null

    const relative = safeRelativeToRepo(resolved)
    if (relative) {
        for (const file of strategy.repoFiles ?? []) {
            if (relative === normalizeRepoPath(file)) return normalizeRepoPath(file)
        }
        for (const dir of strategy.repoDirs ?? []) {
            const normalizedDir = normalizeRepoPath(dir)
            if (relative === normalizedDir || relative.startsWith(`${normalizedDir}/`)) return normalizedDir
        }
    }

    for (const homePattern of strategy.homePathPatterns ?? []) {
        const basePath = resolvePathFromRepo(homePattern.base)
        if (!basePath) continue
        if (!isWithinPath(resolved, basePath)) continue
        if (homePattern.contains && !resolved.includes(homePattern.contains)) continue
        return homePattern.label ?? normalizeRepoPath(homePattern.base)
    }

    return null
}
