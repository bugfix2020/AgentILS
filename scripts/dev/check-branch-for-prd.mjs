#!/usr/bin/env node
/**
 * PRD-aware branch naming check.
 *
 * When a Ralph workflow is active (prd.json exists under scripts/ralph/runs/),
 * this script validates that the current git branch name matches the expected
 * type prefix derived from the PRD content.
 *
 * Each PRD declares its working branch via the `branch` field (set by the
 * product agent at the start of the workflow). The script finds the PRD whose
 * `branch` matches the current git branch, then validates the prefix.
 *
 * Exit codes:
 *   0 — check passed, or no matching PRD (non-Ralph commit, skip)
 *   1 — branch name does not match PRD work type
 *
 * Usage: node scripts/dev/check-branch-for-prd.mjs [--stage]
 *   --stage  (ignored, for ECAM gate compatibility)
 */

import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const RUNS_DIR = 'scripts/ralph/runs'

// --- helpers ---

function getBranch() {
    return execSync('git branch --show-current', { encoding: 'utf8' }).trim()
}

function findPrdByBranch(currentBranch) {
    if (!existsSync(RUNS_DIR)) return null
    const runs = readdirSync(RUNS_DIR, { withFileTypes: true })
    const matches = []
    for (const entry of runs) {
        if (!entry.isDirectory()) continue
        const prdPath = join(RUNS_DIR, entry.name, 'prd.json')
        if (!existsSync(prdPath)) continue
        try {
            const raw = readFileSync(prdPath, 'utf8')
            const prd = JSON.parse(raw)
            // Match by explicit branch field
            if (prd.branch === currentBranch && prd.stage !== 'done') {
                matches.push({ run: entry.name, prd, path: prdPath })
            }
        } catch {
            // skip malformed PRDs
        }
    }
    if (matches.length === 0) return null
    if (matches.length > 1) {
        const runs = matches.map((m) => m.run).join(', ')
        console.error(
            `[branch-check] WARNING: multiple active PRDs declare branch "${currentBranch}": ${runs}. ` +
                `Using the first one. Consider closing duplicate runs.`,
        )
    }
    return matches[0]
}

function inferBranchType(prd) {
    const text = `${prd.title ?? ''} ${prd.description ?? ''}`.toLowerCase()

    // Order matters: more specific patterns first
    if (/\bfix\b|\bbug\b|\bpatch\b|\bhotfix\b/.test(text)) return 'fix/'
    if (/\bdocs?\b|\bdocumentation\b|\breadme\b|\binstructions?\b/.test(text)) return 'docs/'
    if (/\bci\b|\bworkflow\b|\bgithub action\b|\bgoreleaser\b/.test(text)) return 'ci/'
    if (/\bchore\b|\btooling\b|\bconfig\b|\bsync\b/.test(text)) return 'chore/'
    if (/\brefactor\b|\bclean\s*up\b/.test(text)) return 'refactor/'
    if (/\btest\b|\bspec\b/.test(text)) return 'test/'

    // Default: treat as feature work
    return 'feat/'
}

// --- main ---

const branch = getBranch()

// Protected branches — always fail
const PROTECTED = new Set(['main', 'master', 'develop', 'dev'])
if (PROTECTED.has(branch)) {
    console.error(
        `[branch-check] ERROR: on protected branch "${branch}". ` +
            `Create a feature branch first: git checkout -b <type>/<short-kebab>`,
    )
    process.exit(1)
}

// Find the PRD that declared this branch as its working branch
const match = findPrdByBranch(branch)
if (!match) {
    // No PRD claims this branch — non-Ralph commit, skip
    process.exit(0)
}

const { prd, run } = match
const expectedPrefix = inferBranchType(prd)

if (!branch.startsWith(expectedPrefix)) {
    console.error(
        `[branch-check] ERROR: branch "${branch}" does not match PRD work type.\n` +
            `  PRD [${run}]: "${prd.title}"\n` +
            `  Expected prefix: "${expectedPrefix}"\n` +
            `  Fix: git checkout -b ${expectedPrefix}<short-kebab>`,
    )
    process.exit(1)
}

process.exit(0)
