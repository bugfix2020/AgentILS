import { DEFAULT_STEPS, DRY_RUN_FAIL_STEPS, DRY_RUN_STEPS, type StepDefinition } from './steps.js'
import { runPrecommit } from './runner.js'

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
    return runPrecommit({ cwd: opts.cwd, steps: opts.steps })
}

main().then(
    (code) => process.exit(code),
    (err) => {
        process.stderr.write(`${(err as Error).stack ?? String(err)}\n`)
        process.exit(1)
    },
)
