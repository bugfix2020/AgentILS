#!/usr/bin/env node

/**
 * ECAM gate: block commits that contain manual version bumps.
 *
 * This repo uses changesets for all version management.
 * `npm version patch/minor/major` and manual `"version"` edits in
 * package.json are forbidden — version bumps must go through
 * `pnpm changeset` → `pnpm changeset version`.
 */

import { execSync } from 'node:child_process'

const LABEL = 'VERSION BUMP GUARD'

function log(msg) {
    process.stderr.write(`[1/1] ${LABEL} ${msg}\n`)
}

try {
    // 1. Check staged package.json files for "version" field changes
    const diff = execSync('git diff --cached -- "**/package.json" -U0', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
    })

    if (diff) {
        // Match added lines that change the "version" field
        // Pattern: +  "version": "..." (but NOT in node_modules, and not removal lines)
        const versionBumpLines = diff.split('\n').filter((line) => {
            if (!line.startsWith('+')) return false
            if (line.startsWith('+++')) return false
            // Match "version": "x.y.z" — the JSON field
            return /^\+\s*"version"\s*:\s*"/.test(line)
        })

        if (versionBumpLines.length > 0) {
            console.error(
                `\n${LABEL}: manual version bump detected in staged package.json.\n` +
                    `  This repo uses changesets. Do NOT edit "version" manually.\n` +
                    `  Use: pnpm changeset → pnpm changeset version\n\n` +
                    versionBumpLines.map((l) => `  ${l}`).join('\n') +
                    '\n',
            )
            process.exit(1)
        }
    }

    log('ok')
    process.exit(0)
} catch (e) {
    // git diff returns non-zero when there are no matching files — that's fine
    if (e.status === 1 && !e.stdout && !e.stderr?.toString().includes('fatal')) {
        log('ok (no package.json changes)')
        process.exit(0)
    }
    console.error(`${LABEL}: unexpected error: ${e.message}`)
    process.exit(1)
}
