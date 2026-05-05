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
                setState((cur) => updateAt(cur, i, { status: 'running' }))
                const result = await runStep(steps[i]!, cwd)
                if (cancelled) return
                setState((cur) => updateAt(cur, i, result))
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
