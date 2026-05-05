import { spawn } from 'node:child_process'

export type StepStatus = 'pending' | 'running' | 'passed' | 'failed'

export interface StepDefinition {
    /** Short upper-case label rendered in the panel row. */
    label: string
    /** Shell command executed via `sh -c` / `cmd /c`. Mutually exclusive with `argv`. */
    cmd?: string
    /**
     * Direct argv to spawn (no shell). Preferred for dry-run / cross-platform
     * fixtures that would otherwise need shell-specific quoting.
     */
    argv?: { command: string; args: string[] }
}

export interface StepState extends StepDefinition {
    status: StepStatus
    /** Wall-clock duration in ms once the step settles. */
    durationMs?: number
    /** Last 4 KiB of combined stdout/stderr for failure diagnostics. */
    tail?: string
    /** Process exit code for completed steps. */
    exitCode?: number
}

/**
 * Default pre-commit pipeline. Mirrors the historical
 * `scripts/dev/pre-commit-gate.mjs` step list.
 */
export const DEFAULT_STEPS: StepDefinition[] = [
    {
        label: 'SYNC COPILOT INSTRUCTIONS',
        cmd: 'node scripts/dev/sync-agent-instructions.mjs --stage',
    },
    {
        label: 'GENERATE FLOWCHARTS',
        cmd: 'pnpm run generate:flowcharts',
    },
    {
        label: 'LINT-STAGED  STAGED FILES',
        cmd: 'pnpm exec lint-staged',
    },
]

/**
 * Dry-run demo pipeline for previewing the ECAM panel without touching the
 * repository. Three short shell sleeps that always succeed.
 */
export const DRY_RUN_STEPS: StepDefinition[] = [
    {
        label: 'SYNC COPILOT INSTRUCTIONS',
        argv: dryArgv(1500, 'sync ok'),
    },
    {
        label: 'GENERATE FLOWCHARTS',
        argv: dryArgv(1100, 'flowcharts ok'),
    },
    {
        label: 'LINT-STAGED  STAGED FILES',
        argv: dryArgv(1700, 'lint-staged ok'),
    },
]

/**
 * Dry-run demo pipeline that intentionally fails the second step so users can
 * preview the AP DISC / COMMIT BLOCKED failure state.
 */
export const DRY_RUN_FAIL_STEPS: StepDefinition[] = [
    {
        label: 'SYNC COPILOT INSTRUCTIONS',
        argv: dryArgv(900, 'sync ok'),
    },
    {
        label: 'GENERATE FLOWCHARTS',
        argv: dryArgv(1200, 'flowcharts FAIL', 1),
    },
    {
        label: 'LINT-STAGED  STAGED FILES',
        argv: dryArgv(1000, 'lint-staged ok'),
    },
]

/**
 * Build an argv that runs a tiny node snippet with the given delay/output/exit.
 * Avoids shell-quoting issues that broke dry-run on cmd.exe.
 */
function dryArgv(ms: number, message: string, exitCode = 0): { command: string; args: string[] } {
    const snippet = `setTimeout(() => { console.log(${JSON.stringify(message)}); process.exit(${exitCode}); }, ${ms});`
    return { command: process.execPath, args: ['-e', snippet] }
}

/**
 * Run a single shell step, capturing combined output. Resolves with the final
 * StepState (passed | failed). Never rejects.
 */
export function runStep(step: StepDefinition, cwd: string, onChunk?: (chunk: string) => void): Promise<StepState> {
    return new Promise((resolve) => {
        const start = Date.now()
        let command: string
        let args: string[]
        let useShell = false
        if (step.argv) {
            command = step.argv.command
            args = step.argv.args
        } else if (step.cmd) {
            const isWindows = process.platform === 'win32'
            command = isWindows ? process.env.COMSPEC || 'cmd.exe' : 'sh'
            args = isWindows ? ['/d', '/s', '/c', step.cmd] : ['-c', step.cmd]
            useShell = true
        } else {
            resolve({
                ...step,
                status: 'failed',
                durationMs: 0,
                tail: '[config error] step has neither argv nor cmd',
                exitCode: -1,
            })
            return
        }
        const proc = spawn(command, args, {
            cwd,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: process.env,
            windowsVerbatimArguments: useShell ? false : undefined,
        })

        let buffer = ''
        const TAIL_BYTES = 4096
        const append = (chunk: Buffer) => {
            const text = chunk.toString('utf8')
            buffer = (buffer + text).slice(-TAIL_BYTES)
            onChunk?.(text)
        }
        proc.stdout?.on('data', append)
        proc.stderr?.on('data', append)

        proc.on('error', (err) => {
            buffer = (buffer + `\n[spawn error] ${err.message}`).slice(-TAIL_BYTES)
            resolve({
                ...step,
                status: 'failed',
                durationMs: Date.now() - start,
                tail: buffer,
                exitCode: -1,
            })
        })

        proc.on('close', (code) => {
            const exitCode = code ?? 1
            resolve({
                ...step,
                status: exitCode === 0 ? 'passed' : 'failed',
                durationMs: Date.now() - start,
                tail: buffer,
                exitCode,
            })
        })
    })
}
