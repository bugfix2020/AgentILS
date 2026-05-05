#!/usr/bin/env node
/**
 * Wrapper around `lint-staged --verbose` that prints `[i/N] lint <task>` lines
 * to stderr so the AgentILS pre-commit ECAM panel can show real per-file
 * progress. Total estimate is `stagedFiles * tasksPerFile` (default 2 from
 * lint-staged.config.mjs: eslint + prettier for JS/TS, prettier-only for the
 * rest -- we use the higher value as a conservative upper bound).
 */
import { execFileSync, spawn } from 'node:child_process'
import process from 'node:process'

const TASKS_PER_FILE = 2

let stagedCount = 0
try {
    const out = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
        encoding: 'utf8',
    })
    stagedCount = out
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean).length
} catch {
    stagedCount = 0
}

const total = Math.max(1, stagedCount * TASKS_PER_FILE)
let done = 0

const isWindows = process.platform === 'win32'
const command = isWindows ? process.env.COMSPEC || 'cmd.exe' : 'sh'
const args = isWindows
    ? ['/d', '/s', '/c', 'pnpm exec lint-staged --verbose']
    : ['-c', 'pnpm exec lint-staged --verbose']

const proc = spawn(command, args, {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    windowsVerbatimArguments: false,
})

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g

function handleChunk(chunk) {
    const text = chunk.toString('utf8').replace(ANSI_RE, '')
    process.stdout.write(chunk)
    const lines = text.split(/\r?\n/)
    for (const line of lines) {
        if (/\[COMPLETED\]/.test(line) || /\[SUCCESS\]/.test(line)) {
            done = Math.min(total, done + 1)
            const label = line.replace(/^.*\[(COMPLETED|SUCCESS)\]\s*/, '').trim() || 'task'
            process.stderr.write(`[${done}/${total}] lint ${label}\n`)
        }
    }
}

proc.stdout?.on('data', handleChunk)
proc.stderr?.on('data', (chunk) => {
    process.stderr.write(chunk)
})

proc.on('error', (err) => {
    process.stderr.write(`[lint-staged-wrapper] spawn error: ${err.message}\n`)
    process.exit(1)
})

proc.on('close', (code) => {
    process.exit(code ?? 1)
})
