import { render, useApp } from 'ink'
import React, { useEffect, useState } from 'react'
import { EcamPanel } from './panel.js'
import {
    DEFAULT_STEPS,
    DRY_RUN_FAIL_STEPS,
    DRY_RUN_STEPS,
    runStep,
    type StepDefinition,
    type StepState,
} from './steps.js'

interface CliOptions {
    cwd: string
    steps: StepDefinition[]
    /** Show the help text and exit. */
    help: boolean
}

function parseArgs(argv: string[]): CliOptions {
    const opts: CliOptions = {
        cwd: process.cwd(),
        steps: DEFAULT_STEPS,
        help: false,
    }
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--help' || a === '-h') {
            opts.help = true
        } else if (a === '--cwd' || a === '-C') {
            const v = argv[++i]
            if (!v) throw new Error(`${a} requires a value`)
            opts.cwd = v
        } else if (a === '--dry-run') {
            opts.steps = DRY_RUN_STEPS
        } else if (a === '--dry-run-fail') {
            opts.steps = DRY_RUN_FAIL_STEPS
        }
    }
    return opts
}

const HELP = `agentils-precommit-gate — A320-ECAM-styled pre-commit runner

Usage:
  agentils-precommit-gate [options]

Options:
  -C, --cwd <dir>   Run commands in <dir> (default: current working dir)
  --dry-run         Run a fake 3-step pipeline (all pass) for previewing the panel
  --dry-run-fail    Run a fake pipeline where step 2 fails (preview FAULT state)
  -h, --help        Show this help and exit

Default pipeline:
${DEFAULT_STEPS.map((s) => `  - ${s.label}: ${s.cmd ?? `${s.argv?.command} ${s.argv?.args.join(' ')}`}`).join('\n')}
`

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

    const phase = !done ? 'CLB' : failed ? 'FAULT' : 'CRZ'
    return <EcamPanel steps={state} done={done} failed={failed} phase={phase} />
}

function updateAt(list: StepState[], index: number, patch: Partial<StepState>): StepState[] {
    const next = list.slice()
    next[index] = { ...next[index]!, ...patch }
    return next
}

async function main(): Promise<number> {
    let opts: CliOptions
    try {
        opts = parseArgs(process.argv.slice(2))
    } catch (err) {
        process.stderr.write(`agentils-precommit-gate: ${(err as Error).message}\n`)
        return 2
    }
    if (opts.help) {
        process.stdout.write(HELP)
        return 0
    }
    let exitCode = 0
    const { waitUntilExit } = render(
        <App
            steps={opts.steps}
            cwd={opts.cwd}
            onSettle={(failed) => {
                exitCode = failed ? 1 : 0
            }}
        />,
        { exitOnCtrlC: true },
    )
    await waitUntilExit()
    return exitCode
}

main().then(
    (code) => process.exit(code),
    (err) => {
        process.stderr.write(`${(err as Error).stack ?? String(err)}\n`)
        process.exit(1)
    },
)
