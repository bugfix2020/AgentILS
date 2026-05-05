import { resolveConfig } from './config.js'
import { runPrecommit } from './runner.js'
import { DRY_RUN_FAIL_STEPS, DRY_RUN_STEPS, type StepDefinition } from './steps.js'

interface CliOptions {
    cwd: string
    /** Explicit `--config` path; resolved before fallback discovery. */
    configPath?: string
    /** When set, override config discovery with one of the dry-run fixtures. */
    forcedSteps?: StepDefinition[]
    /** Show the help text and exit. */
    help: boolean
    /** Print resolved config + step list and exit (no execution). */
    printConfig: boolean
}

function parseArgs(argv: string[]): CliOptions {
    const opts: CliOptions = {
        cwd: process.cwd(),
        help: false,
        printConfig: false,
    }
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--help' || a === '-h') {
            opts.help = true
        } else if (a === '--cwd' || a === '-C') {
            const v = argv[++i]
            if (!v) throw new Error(`${a} requires a value`)
            opts.cwd = v
        } else if (a === '--config' || a === '-c') {
            const v = argv[++i]
            if (!v) throw new Error(`${a} requires a value`)
            opts.configPath = v
        } else if (a === '--print-config') {
            opts.printConfig = true
        } else if (a === '--dry-run') {
            opts.forcedSteps = DRY_RUN_STEPS
        } else if (a === '--dry-run-fail') {
            opts.forcedSteps = DRY_RUN_FAIL_STEPS
        }
    }
    return opts
}

const HELP = `agentils-precommit-gate — A320-ECAM-styled pre-commit runner

Usage:
  agentils-precommit-gate [options]

Options:
  -C, --cwd <dir>      Run commands in <dir> (default: current working dir)
  -c, --config <file>  Use this config file instead of upward search
  --print-config       Print resolved step list (and source) and exit
  --dry-run            Run a fake 3-step pipeline (all pass) for previewing the panel
  --dry-run-fail       Run a fake pipeline where step 2 fails (preview FAULT state)
  -h, --help           Show this help and exit

Config files searched (in order, walking upward from --cwd):
  - agentils-gate.config.js
  - agentils-gate.config.mjs
  - agentils-gate.config.cjs
  - agentils-gate.config.ts   (requires jiti or Node ≥ 22.13 + --experimental-strip-types)
  - agentils-gate.config.mts
  - agentils-gate.config.cts

Built-in fallback when no config is found:
  - LINT-STAGED STAGED FILES: pnpm exec lint-staged
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
    let steps: StepDefinition[]
    let source: string | null
    if (opts.forcedSteps) {
        steps = opts.forcedSteps
        source = opts.forcedSteps === DRY_RUN_FAIL_STEPS ? '<dry-run-fail>' : '<dry-run>'
    } else {
        const resolved = await resolveConfig(opts.cwd, opts.configPath)
        steps = resolved.steps
        source = resolved.source
    }
    if (opts.printConfig) {
        process.stdout.write(`source: ${source ?? '<builtin fallback>'}\n`)
        for (const step of steps) {
            const cmd = step.cmd ?? `${step.argv?.command} ${step.argv?.args.join(' ')}`
            process.stdout.write(`  - ${step.label}: ${cmd}\n`)
        }
        return 0
    }
    return runPrecommit({ cwd: opts.cwd, steps })
}

main().then(
    (code) => process.exit(code),
    (err) => {
        process.stderr.write(`\n${(err as Error).stack ?? String(err)}\n`)
        process.exit(1)
    },
)
