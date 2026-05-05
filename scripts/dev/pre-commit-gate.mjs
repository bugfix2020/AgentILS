#!/usr/bin/env node
/**
 * AgentILS Pre-Commit Gate
 * Renders A320 ECAM header, then executes each check with a live spinner.
 * Exits with code 1 if any step fails (blocking the commit).
 */
import { execSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dir, '../..')

// ─── ANSI colors ──────────────────────────────────────────────────────────
const C = {
    grn: '\x1b[32m',
    brt: '\x1b[1;32m',
    amb: '\x1b[33m',
    wht: '\x1b[1;37m',
    cyn: '\x1b[36m',
    dim: '\x1b[2;32m',
    red: '\x1b[31m',
    rst: '\x1b[0m',
}

const IW = 60

/** Strip ANSI codes to get printable length */
function visLen(s) {
    return s.replace(/\x1b\[[0-9;]*m/g, '').length
}

function pad(s, w) {
    return s + ' '.repeat(Math.max(0, w - visLen(s)))
}

function line(content = '') {
    return `${C.dim}║${C.rst}${pad(content, IW)}${C.dim}║${C.rst}`
}

const TOP = () => `${C.dim}╔${'═'.repeat(IW)}╗${C.rst}`
const MID = () => `${C.dim}╠${'═'.repeat(IW)}╣${C.rst}`
const THIN = () => `${C.dim}╟${'─'.repeat(IW)}╢${C.rst}`
const BOT = () => `${C.dim}╚${'═'.repeat(IW)}╝${C.rst}`

function gauge(value, maxVal, width) {
    const pct = Math.min(1, Math.max(0, value / maxVal))
    const pos = Math.round(pct * (width - 1))
    const chars = Array.from({ length: width }, (_, i) => {
        if (i === 0) return `${C.grn}╰`
        if (i === width - 1) return `╯${C.rst}`
        if (i === pos) return `${C.brt}▲${C.grn}`
        return '─'
    })
    return `${C.grn}${chars.join('')}${C.rst}`
}

function vbox(val, unit = '') {
    return `${C.dim}[${C.rst}${C.brt}${String(val).padStart(5)}${C.rst}${C.amb}${unit}${C.rst}${C.dim}]${C.rst}`
}

// ─── Print static ECAM header ─────────────────────────────────────────────
function printHeader() {
    const E1 = { epr: '1.012', ff: 380, egt: 496, n1: 22.6, n2: 62.6 }
    const E2 = { epr: '1.012', ff: 380, egt: 493, n1: 22.6, n2: 61.9 }

    console.log(TOP())

    // Title
    {
        const left = `  ${C.wht}AGENTILS${C.rst}  ${C.dim}A320 ECAM SYS${C.rst}`
        const right = `${C.cyn}CLB${C.rst}`
        const gap = IW - visLen(left) - visLen(right)
        console.log(`${C.dim}║${C.rst}${left}${' '.repeat(Math.max(1, gap))}${right}${C.dim}║${C.rst}`)
    }
    {
        const left = `  ${C.dim}COMMIT GATE CHECK SYSTEM${C.rst}`
        const right = `${C.amb}T.O${C.rst}`
        const gap = IW - visLen(left) - visLen(right)
        console.log(`${C.dim}║${C.rst}${left}${' '.repeat(Math.max(1, gap))}${right}${C.dim}║${C.rst}`)
    }

    console.log(MID())

    // EPR
    console.log(line(`              ${C.wht}EPR${C.rst}`))
    {
        const g1 = gauge(E1.epr * 100, 200, 12)
        const g2 = gauge(E2.epr * 100, 200, 12)
        const b1 = vbox(E1.epr)
        const b2 = vbox(E2.epr)
        const inner = `  ${g1}  ${b1}    ${g2}  ${b2}  `
        console.log(`${C.dim}║${C.rst}${inner}${' '.repeat(Math.max(0, IW - visLen(inner)))}${C.dim}║${C.rst}`)
    }
    console.log(THIN())

    // FF / EGT
    {
        const lbl = `  ${C.grn}FF KG/H${C.rst}          ${C.wht}EGT °C${C.rst}               ${C.grn}FF KG/H${C.rst}`
        console.log(`${C.dim}║${C.rst}${pad(lbl, IW)}${C.dim}║${C.rst}`)
    }
    {
        const b1 = vbox(E1.egt, '°')
        const b2 = vbox(E2.egt, '°')
        const inner = `  ${C.brt}${E1.ff}${C.rst}     ${b1}  ${b2}    ${C.brt}${E2.ff}${C.rst}  `
        console.log(`${C.dim}║${C.rst}${inner}${' '.repeat(Math.max(0, IW - visLen(inner)))}${C.dim}║${C.rst}`)
    }
    console.log(THIN())

    // N2 / N1
    {
        const lbl = `  ${C.grn}N2 %${C.rst}               ${C.wht}N1 %${C.rst}               ${C.grn}N2 %${C.rst}`
        console.log(`${C.dim}║${C.rst}${pad(lbl, IW)}${C.dim}║${C.rst}`)
    }
    {
        const g1 = gauge(E1.n1, 100, 9)
        const g2 = gauge(E2.n1, 100, 9)
        const b = vbox(E1.n1)
        const inner = `  ${C.brt}${E1.n2}${C.rst}  ${g1} ${b} ${g2}  ${C.brt}${E2.n2}${C.rst}  `
        console.log(`${C.dim}║${C.rst}${inner}${' '.repeat(Math.max(0, IW - visLen(inner)))}${C.dim}║${C.rst}`)
    }

    console.log(MID())
    console.log(line(`  ${C.grn}FOB :${C.rst}  ${C.brt}8620${C.rst} ${C.grn}KG${C.rst}`))
    console.log(MID())

    // T.O MEMO
    const mL = [
        `${C.amb}T.O${C.rst}   ${C.grn}AUTO BRK MAX${C.rst}`,
        `      ${C.grn}SIGNS ON${C.rst}`,
        `      ${C.grn}CABIN READY${C.rst}`,
        `      ${C.grn}SPLRS ARM${C.rst}`,
        `      ${C.grn}FLAPS T.O${C.rst}`,
        `      ${C.grn}T.O CONFIG NORMAL${C.rst}`,
    ]
    const mR = [`${C.grn}AUTO BRK MAX${C.rst}`, `${C.grn}PARK BRK${C.rst}`, `${C.grn}TCAS STBY${C.rst}`]
    const rows = Math.max(mL.length, mR.length)
    for (let i = 0; i < rows; i++) {
        const l = mL[i] ?? ''
        const r = mR[i] ?? ''
        const lPad = pad(l, 30)
        const rPad = pad(r, IW - 30 - 2)
        console.log(`${C.dim}║${C.rst} ${lPad} ${rPad}${C.dim}║${C.rst}`)
    }
    console.log(MID())
}

// ─── Spinner ──────────────────────────────────────────────────────────────
const SPIN_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

/**
 * Run a shell command with a live spinner row inside the ECAM border.
 * Returns true on success, false on failure.
 */
async function runStep({ label, cmd }) {
    const prefix = `  ${C.grn}[   ]${C.rst} ${C.wht}${label}${C.rst}`
    let frameIdx = 0
    let interval = null

    const drawSpinner = () => {
        const frame = SPIN_FRAMES[frameIdx % SPIN_FRAMES.length]
        frameIdx++
        const indicator = `${C.amb}${frame}${C.rst}`
        const inner = `  ${C.grn}[${C.rst}${indicator}${C.grn}]${C.rst} ${C.wht}${label}${C.rst}`
        process.stdout.write(`\r${C.dim}║${C.rst}${pad(inner, IW)}${C.dim}║${C.rst}`)
    }

    // Start spinner
    drawSpinner()
    interval = setInterval(drawSpinner, 80)

    let exitCode = 0
    try {
        await new Promise((resolve, reject) => {
            const proc = spawn('sh', ['-c', cmd], {
                cwd: ROOT,
                stdio: ['inherit', 'pipe', 'pipe'],
            })
            proc.on('close', (code) => {
                exitCode = code ?? 1
                if (exitCode !== 0) reject(new Error(`exit ${exitCode}`))
                else resolve()
            })
        })
    } catch {
        // handled below
    } finally {
        clearInterval(interval)
    }

    if (exitCode === 0) {
        const inner = `  ${C.grn}[${C.brt}✔${C.grn}]${C.rst} ${C.wht}${label}${C.rst}`
        process.stdout.write(`\r${C.dim}║${C.rst}${pad(inner, IW)}${C.dim}║${C.rst}\n`)
        return true
    } else {
        // AP DISCONNECT style: amber label, red fault indicator
        const inner = `  ${C.red}[✘]${C.rst} ${C.red}${label}${C.rst}  ${C.amb}AP DISCONNECT${C.rst}`
        process.stdout.write(`\r${C.dim}║${C.rst}${pad(inner, IW)}${C.dim}║${C.rst}\n`)
        return false
    }
}

// ─── Steps ────────────────────────────────────────────────────────────────
const STEPS = [
    {
        label: 'SYNC COPILOT INSTRUCTIONS',
        cmd: 'node scripts/dev/sync-agent-instructions.mjs --stage',
    },
    {
        label: 'GENERATE FLOWCHARTS',
        cmd: 'pnpm run generate:flowcharts',
    },
    {
        label: 'LINT-STAGED STAGED FILES',
        cmd: 'pnpm exec lint-staged',
    },
]

// ─── Main ─────────────────────────────────────────────────────────────────
printHeader()

let failed = false
for (const step of STEPS) {
    const ok = await runStep(step)
    if (!ok) {
        failed = true
        break
    }
}

// Footer
if (failed) {
    const inner = `  ${C.red}FAULT  ─  COMMIT BLOCKED${C.rst}`
    console.log(`${C.dim}║${C.rst}${inner}${' '.repeat(Math.max(0, IW - visLen(inner)))}${C.dim}║${C.rst}`)
} else {
    const inner = `  ${C.brt}T.O CONFIG  .  .  .  .  .  .  .  .  .  NORMAL${C.rst}`
    console.log(`${C.dim}║${C.rst}${inner}${' '.repeat(Math.max(0, IW - visLen(inner)))}${C.dim}║${C.rst}`)
}
console.log(BOT())

if (failed) process.exit(1)
