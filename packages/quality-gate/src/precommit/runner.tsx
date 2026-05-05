import { render, useApp } from 'ink'
import React, { useEffect, useState } from 'react'
import { EcamPanel } from './panel.js'
import { runStep, type StepDefinition, type StepState } from './steps.js'

export interface RunPrecommitOptions {
    cwd?: string
    steps: StepDefinition[]
}

interface AppProps {
    steps: StepDefinition[]
    cwd: string
    onSettle: (failed: boolean) => void
}

function App({ steps, cwd, onSettle }: AppProps): React.JSX.Element {
    const { exit } = useApp()
    const [state, setState] = useState<StepState[]>(() => steps.map((s) => ({ ...s, status: 'pending' })))
    const [done, setDone] = useState(false)
    const [failed, setFailed] = useState(false)
    const [frame, setFrame] = useState(0)

    useEffect(() => {
        const id = setInterval(() => setFrame((f) => f + 1), 80)
        return () => clearInterval(id)
    }, [])

    useEffect(() => {
        let cancelled = false
        let exitTimer: ReturnType<typeof setTimeout> | undefined
        ;(async () => {
            let didFail = false
            for (let i = 0; i < steps.length; i++) {
                if (cancelled) return
                setState((cur) =>
                    updateAt(cur, i, { status: 'running', runningStartedAt: Date.now(), currentLine: undefined }),
                )
                const result = await runStep(steps[i]!, cwd, (chunk) => {
                    if (cancelled) return
                    const line = lastMeaningfulLine(chunk)
                    if (line) {
                        setState((cur) => updateAt(cur, i, { currentLine: line }))
                    }
                })
                if (cancelled) return
                setState((cur) => updateAt(cur, i, { ...result, currentLine: undefined }))
                if (result.status === 'failed') {
                    didFail = true
                    break
                }
            }
            if (cancelled) return
            setFailed(didFail)
            setDone(true)
            onSettle(didFail)
            // Give the final frame ~250ms to render before unmounting so the
            // user sees the resolved state instead of a flicker.
            exitTimer = setTimeout(() => exit(), 250)
        })().catch((err) => {
            process.stderr.write(`${(err as Error).stack ?? String(err)}\n`)
            exit(err as Error)
        })
        return () => {
            cancelled = true
            if (exitTimer) clearTimeout(exitTimer)
        }
    }, [steps, cwd, onSettle, exit])

    return <EcamPanel steps={state} frame={frame} done={done} failed={failed} />
}

function updateAt(list: StepState[], index: number, patch: Partial<StepState>): StepState[] {
    const next = list.slice()
    next[index] = { ...next[index]!, ...patch }
    return next
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g

/**
 * Pull the last non-empty line out of a chunk, after stripping ANSI codes.
 * Returns undefined if the chunk only contains whitespace / control sequences.
 */
function lastMeaningfulLine(chunk: string): string | undefined {
    const lines = chunk.replace(ANSI_RE, '').split(/\r?\n/)
    for (let i = lines.length - 1; i >= 0; i--) {
        const t = lines[i]!.trim()
        if (t) return t
    }
    return undefined
}

/**
 * Render the ECAM precommit panel for the given pipeline. Resolves with
 * 0 (all steps passed) or 1 (a step failed). Never rejects.
 */
export async function runPrecommit(options: RunPrecommitOptions): Promise<number> {
    const cwd = options.cwd ?? process.cwd()
    let exitCode = 0
    const { waitUntilExit } = render(
        <App
            steps={options.steps}
            cwd={cwd}
            onSettle={(failed) => {
                exitCode = failed ? 1 : 0
            }}
        />,
        { exitOnCtrlC: true },
    )
    await waitUntilExit()
    return exitCode
}
