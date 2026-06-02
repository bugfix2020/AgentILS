import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const repoRoot = path.resolve(__dirname, '..', '..')
export const homeDir = os.homedir()
export const claudeProjectsDir = path.join(homeDir, '.claude', 'projects')
export const codexMemoriesDir = path.join(homeDir, '.codex', 'memories')

export function readStdinJson() {
    try {
        const raw = fs.readFileSync(0, 'utf8').trim()
        return raw ? JSON.parse(raw) : {}
    } catch {
        return {}
    }
}

export function inferRuntime(input) {
    if ('sessionId' in input || 'hookEventName' in input) return 'copilot'
    if ('turn_id' in input || 'model' in input) return 'codex'
    if ('session_id' in input || 'hook_event_name' in input) return 'claude'
    return 'unknown'
}

export function normalizeHookEventName(value) {
    const key = String(value ?? '')
        .trim()
        .toLowerCase()
    if (key === 'pretooluse' || key === 'pre-tool') return 'pre-tool'
    if (key === 'stop') return 'stop'
    return key
}

export function normalizeRepoPath(filePath) {
    return String(filePath ?? '')
        .replace(/\\/g, '/')
        .replace(/^\.\//, '')
        .replace(/\/+/g, '/')
}

export function collectCandidatePaths(value, out = new Set()) {
    if (typeof value === 'string') {
        for (const candidate of extractPatchPaths(value)) out.add(candidate)
        return [...out]
    }
    if (Array.isArray(value)) {
        for (const item of value) collectCandidatePaths(item, out)
        return [...out]
    }
    if (!value || typeof value !== 'object') return [...out]

    for (const [key, entry] of Object.entries(value)) {
        if (typeof entry === 'string' && /(file|path)$/i.test(key)) {
            out.add(entry)
        } else if (Array.isArray(entry) && /(files|paths)$/i.test(key)) {
            for (const item of entry) {
                if (typeof item === 'string') out.add(item)
            }
        }
        if (entry && typeof entry === 'object') collectCandidatePaths(entry, out)
    }

    return [...out]
}

export function collectCommandStrings(value, out = new Set()) {
    if (typeof value === 'string') return [...out]
    if (Array.isArray(value)) {
        for (const item of value) collectCommandStrings(item, out)
        return [...out]
    }
    if (!value || typeof value !== 'object') return [...out]

    for (const [key, entry] of Object.entries(value)) {
        if (typeof entry === 'string' && /(command|cmd)$/i.test(key)) {
            out.add(entry)
        }
        if (entry && typeof entry === 'object') collectCommandStrings(entry, out)
    }

    return [...out]
}

export function resolvePathFromRepo(candidate) {
    const raw = String(candidate ?? '').trim()
    if (!raw) return null
    if (raw.startsWith('~')) return path.resolve(homeDir, raw.slice(1))
    if (raw.startsWith('$HOME/')) return path.resolve(homeDir, raw.slice('$HOME/'.length))
    if (path.isAbsolute(raw)) return path.normalize(raw)
    return path.resolve(repoRoot, raw)
}

export function safeRelativeToRepo(targetPath) {
    const relative = path.relative(repoRoot, targetPath)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        return null
    }
    return normalizeRepoPath(relative)
}

export function isWithinPath(targetPath, basePath) {
    const relative = path.relative(basePath, targetPath)
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export function fileExists(relativePath) {
    return fs.existsSync(path.join(repoRoot, relativePath))
}

export function getDirtyPaths() {
    try {
        const output = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
            cwd: repoRoot,
            encoding: 'utf8',
        })
        return output
            .split('\n')
            .map((line) => line.trimEnd())
            .filter(Boolean)
            .map((line) => line.slice(3))
            .map((file) => (file.includes(' -> ') ? file.split(' -> ').at(-1) : file))
            .map(normalizeRepoPath)
    } catch {
        return []
    }
}

export function getDiffPaths({ base, head, diffFilter } = {}) {
    if (!base || !head) return []
    try {
        const args = ['diff', '--name-only']
        if (diffFilter) args.push(`--diff-filter=${diffFilter}`)
        args.push(base, head, '--')
        const output = execFileSync('git', args, {
            cwd: repoRoot,
            encoding: 'utf8',
        })
        return output
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map(normalizeRepoPath)
    } catch {
        return []
    }
}

export function instructionsAreSynced() {
    try {
        execFileSync('node', ['scripts/dev/sync-agent-instructions.mjs', '--check'], {
            cwd: repoRoot,
            stdio: 'ignore',
        })
        return true
    } catch {
        return false
    }
}

export function formatFindingMessage(finding) {
    if (!finding) return ''
    const fixHint = finding.fixHint ? ` Fix: ${finding.fixHint}` : ''
    return `${finding.failureMessage}${fixHint}`
}

export function renderJson(value) {
    return `${JSON.stringify(value)}\n`
}

export function globToRegExp(pattern) {
    const escaped = normalizeRepoPath(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&')
    const source = escaped
        .replace(/\*\*/g, '::DOUBLE_STAR::')
        .replace(/\*/g, '[^/]*')
        .replace(/::DOUBLE_STAR::/g, '.*')
    return new RegExp(`^${source}$`)
}

export function extractPatchPaths(patchText) {
    const raw = String(patchText ?? '')
    if (!raw.includes('*** ')) return []

    const paths = new Set()
    const patterns = [
        /^\*\*\* Update File: (.+)$/gm,
        /^\*\*\* Add File: (.+)$/gm,
        /^\*\*\* Delete File: (.+)$/gm,
        /^\*\*\* Move to: (.+)$/gm,
    ]
    for (const pattern of patterns) {
        for (const match of raw.matchAll(pattern)) {
            const candidate = String(match[1] ?? '').trim()
            if (candidate) paths.add(candidate)
        }
    }
    return [...paths]
}
