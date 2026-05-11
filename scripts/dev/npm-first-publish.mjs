#!/usr/bin/env node

/**
 * npm First Publish — interactive CLI for publishing a NEW package to npm.
 *
 * Use this when a package has never been published before (npm 404).
 * After the first publish, configure Trusted Publisher (OIDC) on
 * https://www.npmjs.com/package/<name>/access so CI can auto-publish.
 *
 * Usage:
 *   node scripts/dev/npm-first-publish.mjs <package-name>
 *   node scripts/dev/npm-first-publish.mjs <package-name> --otp 123456
 *   node scripts/dev/npm-first-publish.mjs <package-name> --dry-run
 */

import { execSync } from 'node:child_process'
import { createInterface } from 'node:readline'
import { resolve, dirname } from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// ── helpers ──────────────────────────────────────────────────────────

const TOTAL_STEPS = 6

function step(n, label) {
    process.stderr.write(`[${n}/${TOTAL_STEPS}] ${label}\n`)
}

function ok(msg) {
    process.stderr.write(`  ✓ ${msg}\n`)
}

function warn(msg) {
    process.stderr.write(`  ⚠ ${msg}\n`)
}

function fail(msg) {
    process.stderr.write(`  ✗ ${msg}\n`)
}

function run(cmd, opts = {}) {
    try {
        return execSync(cmd, {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
            ...opts,
        }).trim()
    } catch (e) {
        return null
    }
}

function runOrThrow(cmd, label) {
    try {
        return execSync(cmd, {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
        }).trim()
    } catch (e) {
        fail(`${label} failed`)
        if (e.stderr) process.stderr.write(`  ${e.stderr.toString().trim()}\n`)
        process.exit(1)
    }
}

async function ask(question) {
    const rl = createInterface({ input: process.stdin, output: process.stderr })
    return new Promise((resolve) => {
        rl.question(`  ${question}: `, (answer) => {
            rl.close()
            resolve(answer.trim())
        })
    })
}

// ── parse args ───────────────────────────────────────────────────────

const args = process.argv.slice(2)
const pkgName = args.find((a) => !a.startsWith('--'))

const dryRun = args.includes('--dry-run')
const skipTag = args.includes('--skip-tag')
let otp = null
{
    const idx = args.indexOf('--otp')
    if (idx !== -1 && args[idx + 1]) otp = args[idx + 1]
}

if (!pkgName) {
    process.stderr.write(
        'Usage: node scripts/dev/npm-first-publish.mjs <package-name> [--otp <code>] [--dry-run] [--skip-tag]\n',
    )
    process.exit(1)
}

const GITHUB_BASE = 'https://github.com/bugfix2020/AgentILS'

// ── Step 1: check npm login ──────────────────────────────────────────

step(1, 'CHECK NPM LOGIN')
const whoami = run('npm whoami')
if (!whoami) {
    fail('Not logged in to npm.')
    process.stderr.write('  Run: npm login\n')
    process.stderr.write('  Then re-run this script.\n')
    process.exit(1)
}
ok(`Logged in as ${whoami}`)

// ── Step 2: check package does NOT already exist ─────────────────────

step(2, 'CHECK PACKAGE ON NPM')
const existingVersion = run(`npm view ${pkgName} version`)
if (existingVersion) {
    fail(`${pkgName}@${existingVersion} already exists on npm.`)
    process.stderr.write('  This script is for first-time publishes only.\n')
    process.stderr.write('  For updates, use CI + Trusted Publisher (OIDC) instead.\n')
    process.exit(1)
}
ok(`${pkgName} not found on npm — this is a first publish.`)

// ── Step 3: locate package dir ───────────────────────────────────────

step(3, 'LOCATE PACKAGE')
const pkgDir = run(`pnpm --filter ${pkgName} pwd`)
if (!pkgDir) {
    fail(`Cannot locate ${pkgName} in this workspace.`)
    process.exit(1)
}
const pkgJsonPath = resolve(pkgDir, 'package.json')
let pkgJson
try {
    pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
} catch {
    fail(`Cannot read ${pkgJsonPath}`)
    process.exit(1)
}
ok(`Found at ${pkgDir}`)
ok(`Version: ${pkgJson.version}`)

// ── Step 4: build ────────────────────────────────────────────────────

step(4, 'BUILD')
runOrThrow(`pnpm --filter ${pkgName} build`, 'Build')
ok('Build succeeded')

// ── Step 5: verify (npm pack --dry-run) ──────────────────────────────

step(5, 'VERIFY (npm pack --dry-run)')
const packOutput = runOrThrow(`npm pack --dry-run 2>&1`, 'npm pack')
const packLines = packOutput.split('\n')
const hasReadme = packLines.some((l) => /README\.md/i.test(l))
const hasPkgJson = packLines.some((l) => /package\.json/i.test(l))
const hasMap = packLines.some((l) => /\.map\b/i.test(l))

if (!hasReadme) warn('README.md not found in tarball')
else ok('README.md included')
if (!hasPkgJson) warn('package.json not found in tarball')
else ok('package.json included')
if (hasMap) warn('Source map files detected in tarball — consider excluding them')

// ── Step 6: publish ──────────────────────────────────────────────────

if (dryRun) {
    step(6, 'PUBLISH (dry-run — skipping)')
    ok('Dry-run complete. No files were published.')
    process.exit(0)
}

step(6, 'PUBLISH')
let publishCmd = `npm publish --access public`
if (otp) publishCmd += ` --otp ${otp}`

let publishResult
try {
    publishResult = execSync(publishCmd, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: pkgDir,
    }).trim()
    ok(`Published ${pkgName}@${pkgJson.version}`)
} catch (e) {
    const stderr = e.stderr?.toString() || ''
    // OTP required — prompt user
    if (stderr.includes('OTP') || stderr.includes('otp') || stderr.includes('one-time passcode')) {
        warn('npm requires a one-time passcode (2FA).')
        const code = await ask('Enter OTP code')
        if (!code) {
            fail('No OTP provided.')
            process.exit(1)
        }
        try {
            publishResult = execSync(`npm publish --access public --otp ${code}`, {
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: pkgDir,
            }).trim()
            ok(`Published ${pkgName}@${pkgJson.version}`)
        } catch (e2) {
            fail('Publish failed')
            process.stderr.write(`  ${e2.stderr?.toString().trim() || e2.message}\n`)
            process.exit(1)
        }
    } else {
        fail('Publish failed')
        process.stderr.write(`  ${stderr.trim() || e.message}\n`)
        process.exit(1)
    }
}

// ── git tag ──────────────────────────────────────────────────────────

if (!skipTag) {
    const tag = `${pkgName}@${pkgJson.version}`
    try {
        execSync(`git tag ${tag}`, { stdio: 'pipe' })
        execSync(`git push origin ${tag}`, { stdio: 'pipe' })
        ok(`Tagged ${tag}`)
    } catch (e) {
        warn(`Tag push failed: ${e.message}`)
        warn(`You can tag manually: git tag ${tag} && git push origin ${tag}`)
    }
}

process.stderr.write('\n')
ok(`Done! ${pkgName}@${pkgJson.version} is now on npm.`)
process.stderr.write(`  npm: https://www.npmjs.com/package/${pkgName}\n`)
process.stderr.write(`\n  Next: configure Trusted Publisher (OIDC) at:\n`)
process.stderr.write(`  https://www.npmjs.com/package/${pkgName}/access\n`)
