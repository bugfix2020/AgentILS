import { Box, Text } from 'ink'
import React from 'react'
import type { StepState, StepStatus } from './steps.js'

/**
 * 1:1 port of `scripts/dev/pre-commit-gate.mjs` ECAM panel.
 *
 * The mjs version prints a static A320 ECAM SYS header once, then mutates a
 * single spinner row in place per step. We render the same layout in ink with
 * `<Text>` rows that carry raw ANSI escapes — ink passes them through unchanged.
 */

export interface EcamPanelProps {
    steps: StepState[]
    /** Frame counter advanced by the runner; drives the braille spinner. */
    frame: number
    done: boolean
    failed: boolean
}

const IW = 60

const C = {
    grn: '\x1b[32m',
    brt: '\x1b[1;32m',
    amb: '\x1b[33m',
    wht: '\x1b[1;37m',
    cyn: '\x1b[36m',
    dim: '\x1b[2;32m',
    red: '\x1b[31m',
    rst: '\x1b[0m',
} as const

const SPIN_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const

function visLen(s: string): number {
    // eslint-disable-next-line no-control-regex
    return s.replace(/\x1b\[[0-9;]*m/g, '').length
}

function pad(s: string, w: number): string {
    return s + ' '.repeat(Math.max(0, w - visLen(s)))
}

function rowLine(content = ''): string {
    return `${C.dim}║${C.rst}${pad(content, IW)}${C.dim}║${C.rst}`
}

const TOP = `${C.dim}╔${'═'.repeat(IW)}╗${C.rst}`
const MID = `${C.dim}╠${'═'.repeat(IW)}╣${C.rst}`
const THIN = `${C.dim}╟${'─'.repeat(IW)}╢${C.rst}`
const BOT = `${C.dim}╚${'═'.repeat(IW)}╝${C.rst}`

function gauge(value: number, maxVal: number, width: number): string {
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

function vbox(val: string | number, unit = ''): string {
    return `${C.dim}[${C.rst}${C.brt}${String(val).padStart(5)}${C.rst}${C.amb}${unit}${C.rst}${C.dim}]${C.rst}`
}

function headerLines(): string[] {
    const E1 = { epr: '1.012', ff: 380, egt: 496, n1: 22.6, n2: 62.6 }
    const E2 = { epr: '1.012', ff: 380, egt: 493, n1: 22.6, n2: 61.9 }

    const out: string[] = []
    out.push(TOP)

    {
        const left = `  ${C.wht}AGENTILS${C.rst}  ${C.dim}A320 ECAM SYS${C.rst}`
        const right = `${C.cyn}CLB${C.rst}`
        const gap = IW - visLen(left) - visLen(right)
        out.push(`${C.dim}║${C.rst}${left}${' '.repeat(Math.max(1, gap))}${right}${C.dim}║${C.rst}`)
    }
    {
        const left = `  ${C.dim}COMMIT GATE CHECK SYSTEM${C.rst}`
        const right = `${C.amb}T.O${C.rst}`
        const gap = IW - visLen(left) - visLen(right)
        out.push(`${C.dim}║${C.rst}${left}${' '.repeat(Math.max(1, gap))}${right}${C.dim}║${C.rst}`)
    }
    out.push(MID)

    out.push(rowLine(`              ${C.wht}EPR${C.rst}`))
    {
        const g1 = gauge(parseFloat(E1.epr) * 100, 200, 12)
        const g2 = gauge(parseFloat(E2.epr) * 100, 200, 12)
        const inner = `  ${g1}  ${vbox(E1.epr)}    ${g2}  ${vbox(E2.epr)}  `
        out.push(`${C.dim}║${C.rst}${inner}${' '.repeat(Math.max(0, IW - visLen(inner)))}${C.dim}║${C.rst}`)
    }
    out.push(THIN)

    out.push(rowLine(`  ${C.grn}FF KG/H${C.rst}          ${C.wht}EGT °C${C.rst}               ${C.grn}FF KG/H${C.rst}`))
    {
        const inner = `  ${C.brt}${E1.ff}${C.rst}     ${vbox(E1.egt, '°')}  ${vbox(E2.egt, '°')}    ${C.brt}${E2.ff}${C.rst}  `
        out.push(`${C.dim}║${C.rst}${inner}${' '.repeat(Math.max(0, IW - visLen(inner)))}${C.dim}║${C.rst}`)
    }
    out.push(THIN)

    out.push(rowLine(`  ${C.grn}N2 %${C.rst}               ${C.wht}N1 %${C.rst}               ${C.grn}N2 %${C.rst}`))
    {
        const g1 = gauge(E1.n1, 100, 9)
        const g2 = gauge(E2.n1, 100, 9)
        const inner = `  ${C.brt}${E1.n2}${C.rst}  ${g1} ${vbox(E1.n1)} ${g2}  ${C.brt}${E2.n2}${C.rst}  `
        out.push(`${C.dim}║${C.rst}${inner}${' '.repeat(Math.max(0, IW - visLen(inner)))}${C.dim}║${C.rst}`)
    }

    out.push(MID)
    out.push(rowLine(`  ${C.grn}FOB :${C.rst}  ${C.brt}8620${C.rst} ${C.grn}KG${C.rst}`))
    out.push(MID)

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
        out.push(`${C.dim}║${C.rst} ${lPad} ${rPad}${C.dim}║${C.rst}`)
    }
    out.push(MID)
    return out
}

function stepIndicator(status: StepStatus, frame: number): string {
    switch (status) {
        case 'pending':
            return ' '
        case 'running': {
            const f = SPIN_FRAMES[frame % SPIN_FRAMES.length] ?? SPIN_FRAMES[0]
            return `${C.amb}${f}${C.rst}`
        }
        case 'passed':
            return `${C.brt}✔${C.rst}`
        case 'failed':
            return `${C.red}✘${C.rst}`
    }
}

function stepRow(step: StepState, frame: number): string {
    const indicator = stepIndicator(step.status, frame)
    const labelColor = step.status === 'failed' ? C.red : C.wht
    let inner = `  ${C.grn}[${C.rst}${indicator}${C.grn}]${C.rst} ${labelColor}${step.label}${C.rst}`
    if (step.status === 'failed') {
        inner += `  ${C.amb}AP DISCONNECT${C.rst}`
    }
    return rowLine(inner)
}

function footerLine(failed: boolean): string {
    if (failed) {
        return rowLine(`  ${C.red}FAULT  ─  COMMIT BLOCKED${C.rst}`)
    }
    return rowLine(`  ${C.brt}T.O CONFIG  .  .  .  .  .  .  .  .  .  NORMAL${C.rst}`)
}

export function EcamPanel({ steps, frame, done, failed }: EcamPanelProps): React.JSX.Element {
    const lines: string[] = [...headerLines()]
    for (const step of steps) {
        lines.push(stepRow(step, frame))
    }
    if (done) {
        lines.push(footerLine(failed))
    }
    lines.push(BOT)

    return (
        <Box flexDirection="column">
            {lines.map((l, i) => (
                <Text key={i}>{l}</Text>
            ))}
        </Box>
    )
}
