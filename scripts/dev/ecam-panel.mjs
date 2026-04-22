#!/usr/bin/env node
/**
 * AgentILS Pre-Commit ECAM Panel
 * Renders an A320-style ECAM ENGINE display in the terminal using ANSI colors
 * and Unicode box/block characters.
 *
 * Usage: node scripts/ecam-panel.mjs <step> <status>
 *   step   : 'header' | 'sync' | 'charts' | 'lint' | 'footer'
 *   status : 'running' | 'normal' | 'fault'
 */

// ANSI color definitions matching A320 ECAM color coding
const C = {
    grn: '\x1b[32m', // normal / nominal — green
    brt: '\x1b[1;32m', // bright green — active value
    amb: '\x1b[33m', // amber — warning
    wht: '\x1b[1;37m', // white — labels / computed values
    cyn: '\x1b[36m', // cyan — selected / highlighted
    dim: '\x1b[2;32m', // dim green — borders / decorative
    red: '\x1b[31m', // red — fault / inhibited
    rst: '\x1b[0m', // reset
}

// Panel inner width (characters inside borders, NOT including ║ on each side)
const IW = 60

/** Strip ANSI codes to get printable length */
function visLen(s) {
    return s.replace(/\x1b\[[0-9;]*m/g, '').length
}

/** Pad a string (with ANSI codes) to visible width `w`, aligned left/right/center */
function pad(s, w, align = 'left') {
    const gap = Math.max(0, w - visLen(s))
    if (align === 'right') return ' '.repeat(gap) + s
    if (align === 'center') {
        const l = Math.floor(gap / 2)
        return ' '.repeat(l) + s + ' '.repeat(gap - l)
    }
    return s + ' '.repeat(gap)
}

/** Full-width bordered row: ║ <content padded to IW> ║ */
function line(content = '') {
    return `${C.dim}║${C.rst}${pad(content, IW)}${C.dim}║${C.rst}`
}

/** Horizontal rule variants */
const TOP = () => `${C.dim}╔${'═'.repeat(IW)}╗${C.rst}`
const MID = () => `${C.dim}╠${'═'.repeat(IW)}╣${C.rst}`
const THIN = () => `${C.dim}╟${'─'.repeat(IW)}╢${C.rst}`
const BOT = () => `${C.dim}╚${'═'.repeat(IW)}╝${C.rst}`

/** Render a simplified arc gauge, `width` chars wide */
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

/** Value display box  [  val ] */
function vbox(val, unit = '') {
    const v = String(val).padStart(5)
    return `${C.dim}[${C.rst}${C.brt}${v}${C.amb}${unit}${C.rst}${C.dim}]${C.rst}`
}

// ─── Arguments ────────────────────────────────────────────────────────────
const [, , step = 'header', status = 'normal'] = process.argv

const statusColor = status === 'fault' ? C.red : status === 'running' ? C.amb : C.grn
const statusLabel = pad(`${statusColor}${status.toUpperCase()}${C.rst}`, 9)

// ─── Engine data ──────────────────────────────────────────────────────────
const E1 = { epr: '1.012', ff: 380, egt: 496, n1: 22.6, n2: 62.6 }
const E2 = { epr: '1.012', ff: 380, egt: 493, n1: 22.6, n2: 61.9 }

// ─── Sections ─────────────────────────────────────────────────────────────

if (step === 'header') {
    const title = `  ${C.wht}AGENTILS${C.rst}  ${C.dim}A320 ECAM SYS${C.rst}`
    const phase = `${C.cyn}CLB${C.rst}`
    const sub = `  ${C.dim}COMMIT GATE CHECK SYSTEM${C.rst}`
    const to = `${C.amb}T.O${C.rst}`

    // Header rows
    console.log(TOP())
    // Title line: left=title, right-align phase tag
    {
        const left = title
        const right = phase
        const gap = IW - visLen(left) - visLen(right)
        console.log(`${C.dim}║${C.rst}${left}${' '.repeat(Math.max(1, gap))}${right}${C.dim}║${C.rst}`)
    }
    {
        const left = sub
        const right = to
        const gap = IW - visLen(left) - visLen(right)
        console.log(`${C.dim}║${C.rst}${left}${' '.repeat(Math.max(1, gap))}${right}${C.dim}║${C.rst}`)
    }
    console.log(MID())

    // ── EPR ──
    console.log(line(`              ${C.wht}EPR${C.rst}`))
    {
        const g1 = gauge(E1.epr * 100, 200, 12)
        const g2 = gauge(E2.epr * 100, 200, 12)
        const b1 = vbox(E1.epr)
        const b2 = vbox(E2.epr)
        // Build fixed inner string  "  <g1>  <b1>    <g2>  <b2>  "
        const inner = `  ${g1}  ${b1}    ${g2}  ${b2}  `
        console.log(`${C.dim}║${C.rst}${inner}${' '.repeat(Math.max(0, IW - visLen(inner)))}${C.dim}║${C.rst}`)
    }
    console.log(THIN())

    // ── FF / EGT ──
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

    // ── N2 / N1 ──
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

    // ── FOB ──
    console.log(line(`  ${C.grn}FOB :${C.rst}  ${C.brt}8620${C.rst} ${C.grn}KG${C.rst}`))
    console.log(MID())

    // ── T.O MEMO ──
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

if (step === 'sync') {
    const inner = `  ${C.grn}[SYS]${C.rst} ${C.wht}SYNC COPILOT INSTRUCTIONS${C.rst}  ${statusLabel}`
    console.log(`${C.dim}║${C.rst}${inner}${' '.repeat(Math.max(0, IW - visLen(inner)))}${C.dim}║${C.rst}`)
}

if (step === 'charts') {
    const inner = `  ${C.grn}[FLW]${C.rst} ${C.wht}GENERATE FLOWCHARTS${C.rst}        ${statusLabel}`
    console.log(`${C.dim}║${C.rst}${inner}${' '.repeat(Math.max(0, IW - visLen(inner)))}${C.dim}║${C.rst}`)
}

if (step === 'lint') {
    const inner = `  ${C.grn}[QA ]${C.rst} ${C.wht}LINT-STAGED  STAGED FILES${C.rst}  ${statusLabel}`
    console.log(`${C.dim}║${C.rst}${inner}${' '.repeat(Math.max(0, IW - visLen(inner)))}${C.dim}║${C.rst}`)
}

if (step === 'footer') {
    if (status === 'fault') {
        const inner = `  ${C.red}FAULT  ─  COMMIT BLOCKED${C.rst}`
        console.log(`${C.dim}║${C.rst}${inner}${' '.repeat(Math.max(0, IW - visLen(inner)))}${C.dim}║${C.rst}`)
    } else {
        const inner = `  ${C.brt}T.O CONFIG  .  .  .  .  .  .  .  .  .  NORMAL${C.rst}`
        console.log(`${C.dim}║${C.rst}${inner}${' '.repeat(Math.max(0, IW - visLen(inner)))}${C.dim}║${C.rst}`)
    }
    console.log(BOT())
}
