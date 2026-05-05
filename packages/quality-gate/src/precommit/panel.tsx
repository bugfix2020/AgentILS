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
    gry: '\x1b[90m',
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
const BOT = `${C.dim}╚${'═'.repeat(IW)}╝${C.rst}`

function headerLines(): string[] {
    const out: string[] = []
    out.push(TOP)

    {
        const left = `  ${C.wht}AGENTILS${C.rst}  ${C.dim}A320 ECAM SYS${C.rst}`
        out.push(rowLine(left))
    }
    {
        const left = `  ${C.dim}COMMIT GATE CHECK SYSTEM${C.rst}`
        out.push(rowLine(left))
    }
    out.push(MID)

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
        out.push(`${C.dim}║${C.rst} ${lPad} ${rPad}${C.dim}║${C.rst}`)
    }
    out.push(MID)
    return out
}

function stepIndicator(status: StepStatus, frame: number): string {
    switch (status) {
        case 'pending':
            return `${C.gry}○${C.rst}`
        case 'running': {
            const f = SPIN_FRAMES[frame % SPIN_FRAMES.length] ?? SPIN_FRAMES[0]
            return `${C.amb}${f}${C.rst}`
        }
        case 'passed':
            return `${C.brt}●${C.rst}`
        case 'failed':
            return `${C.red}●${C.rst}`
    }
}

/** Color the label based on real subprocess state, not a fake timer. */
function revealedLabel(label: string, status: StepStatus, progress: 'idle' | 'done' | undefined): string {
    if (status === 'pending') {
        return `${C.gry}${label}${C.rst}`
    }
    if (status === 'failed') {
        return `${C.red}${label}${C.rst}`
    }
    if (status === 'passed' || progress === 'done') {
        // Either the step has fully settled, OR the subprocess emitted a
        // completion signal (lint-staged [SUCCESS] etc.) and we are still
        // waiting for the process to fully exit.
        return `${C.brt}${label}${C.rst}`
    }
    // running + still working
    return `${C.gry}${label}${C.rst}`
}

function stepRow(step: StepState, frame: number): string {
    if (typeof step.render === 'function') {
        // User-provided renderer owns the row contents (between the borders).
        // Catch throws so a buggy renderer can't kill the entire pre-commit
        // run; fall back to the default layout with an [render error] marker.
        try {
            const raw = step.render(step)
            if (typeof raw === 'string') {
                return rowLine(raw)
            }
            return rowLine(`  ${C.red}[render error] ${step.label}: not a string${C.rst}`)
        } catch (err) {
            return rowLine(`  ${C.red}[render error] ${step.label}: ${(err as Error).message}${C.rst}`)
        }
    }
    const indicator = stepIndicator(step.status, frame)
    const label = revealedLabel(step.label, step.status, step.progress)
    const left = `  ${C.grn}[${C.rst}${indicator}${C.grn}]${C.rst} ${label}`
    let right = ''
    if (step.status === 'failed') {
        right = `${C.amb}AP DISCONNECT${C.rst}`
    } else if (
        (step.status === 'running' || step.status === 'passed') &&
        typeof step.count === 'number' &&
        typeof step.total === 'number'
    ) {
        const color = step.status === 'passed' ? C.brt : C.amb
        right = `${color}${step.count}/${step.total}${C.rst}`
    }
    if (!right) {
        return rowLine(left)
    }
    const padded = `${right}  `
    const gap = IW - visLen(left) - visLen(padded)
    return `${C.dim}║${C.rst}${left}${' '.repeat(Math.max(1, gap))}${padded}${C.dim}║${C.rst}`
}

/**
 * Render a footer line: green NORMAL on success, red FAULT on failure.
 */
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
