import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cac } from 'cac'
import {
    createDefaultInitOptions,
    doInit,
    isConflictStrategy,
    isPackageManager,
    renderBanner,
    renderHelp,
    type InitOptions,
} from './index.js'
import { doUninstall } from './uninstall.js'
import { runPrecommit } from './precommit/runner.js'
import { DRY_RUN_FAIL_STEPS, DRY_RUN_STEPS } from './precommit/steps.js'
import { resolveConfig } from './precommit/config.js'

interface InitFlags {
    cwd?: string
    packageManager?: string
    prettierConfig?: string
    prettierIgnore?: string
    czrc?: string
    commitlintConfig?: string
    lintStagedConfig?: string
    huskyDir?: string
    preCommitCommand?: string
    commitMsgCommand?: string
    withEslint?: boolean
    withTurbo?: boolean
    install?: boolean
    dryRun?: boolean
    agentilsHooks?: boolean
    force?: boolean
    conflict?: string
    merge?: boolean
    skipExisting?: boolean
    interactive?: boolean
    packageJson?: boolean
    husky?: boolean
    prettier?: boolean
    commitlint?: boolean
    lintStaged?: boolean
}

interface UninstallFlags {
    cwd?: string
    huskyDir?: string
    dryRun?: boolean
}

interface PrecommitFlags {
    cwd?: string
    config?: string
    printConfig?: boolean
    dryRun?: boolean
    dryRunFail?: boolean
}

const VERSION = readPackageVersion()

async function main(): Promise<void> {
    const cli = cac('agentils-quality-gate')

    cli.command('init [dir]', 'Initialize the AgentILS quality gate in [dir] (defaults to cwd)')
        .option('-C, --cwd <dir>', 'Project root, defaults to cwd')
        .option('--package-manager <pm>', 'Force package manager: pnpm | npm | yarn | bun')
        .option('--prettier-config <file>', 'Prettier config file name', { default: 'prettier.config.mjs' })
        .option('--prettier-ignore <file>', 'Prettier ignore file name', { default: '.prettierignore' })
        .option('--czrc <file>', 'czrc file name', { default: '.czrc' })
        .option('--commitlint-config <file>', 'commitlint config file name', { default: 'commitlint.config.mjs' })
        .option('--lint-staged-config <file>', 'lint-staged config file name', { default: 'lint-staged.config.mjs' })
        .option('--husky-dir <dir>', 'Husky directory', { default: '.husky' })
        .option('--pre-commit-command <cmd>', 'Command for the pre-commit hook')
        .option('--commit-msg-command <cmd>', 'Command for the commit-msg hook')
        .option('--with-eslint', 'Lint JS/TS staged files with eslint and write eslint.config.mjs')
        .option('--with-turbo', 'Write turbo.json and add turbo to devDependencies')
        .option('--install', 'Run the detected package manager install after writing files')
        .option('--dry-run', 'Print planned changes without writing files or installing dependencies')
        .option('--agentils-hooks', 'Use AgentILS custom Husky hook templates')
        .option('--force', 'Overwrite existing files (alias for --conflict overwrite)')
        .option('--conflict <strategy>', 'Conflict strategy: overwrite | merge | skip | cancel')
        .option('--merge', 'Shortcut for --conflict merge')
        .option('--skip-existing', 'Shortcut for --conflict skip')
        .option('--interactive', 'Force interactive prompts')
        .option('--no-interactive', 'Disable interactive prompts')
        .option('--no-package-json', 'Skip writing package.json scripts/devDependencies')
        .option('--no-husky', 'Skip writing Husky hooks')
        .option('--no-prettier', 'Skip writing Prettier config files')
        .option('--no-commitlint', 'Skip writing commitlint config files')
        .option('--no-lint-staged', 'Skip writing lint-staged config files')
        .action(async (dir: string | undefined, flags: InitFlags) => {
            const cwd = resolve(dir ?? flags.cwd ?? process.cwd())
            const opts = mergeInitOptions(createDefaultInitOptions(cwd), flags)
            await doInit(opts)
        })

    cli.command('uninstall [dir]', 'Reverse a minimal subset of init: delete .husky and AgentILS scripts')
        .option('-C, --cwd <dir>', 'Project root, defaults to cwd')
        .option('--husky-dir <dir>', 'Husky directory', { default: '.husky' })
        .option('--dry-run', 'Print planned changes without modifying files')
        .action(async (dir: string | undefined, flags: UninstallFlags) => {
            const cwd = resolve(dir ?? flags.cwd ?? process.cwd())
            await doUninstall({ cwd, huskyDir: flags.huskyDir ?? '.husky', dryRun: flags.dryRun ?? false })
        })

    cli.command(
        'precommit',
        'Run the A320-ECAM-styled pre-commit pipeline (intended to be called from .husky/pre-commit)',
    )
        .option('-C, --cwd <dir>', 'Project root, defaults to cwd')
        .option('-c, --config <file>', 'Use this config file instead of searching upward')
        .option('--print-config', 'Print the resolved step list (and source path) and exit')
        .option('--dry-run', 'Run a fake 3-step pipeline that always passes (preview)')
        .option('--dry-run-fail', 'Run a fake pipeline where step 2 fails (preview FAULT)')
        .action(async (flags: PrecommitFlags) => {
            const cwd = resolve(flags.cwd ?? process.cwd())
            let steps
            let source: string | null = null
            if (flags.dryRunFail) {
                steps = DRY_RUN_FAIL_STEPS
                source = '<dry-run-fail>'
            } else if (flags.dryRun) {
                steps = DRY_RUN_STEPS
                source = '<dry-run>'
            } else {
                const resolved = await resolveConfig(cwd, flags.config)
                steps = resolved.steps
                source = resolved.source
            }
            if (flags.printConfig) {
                process.stdout.write(`source: ${source ?? '<builtin fallback>'}\n`)
                for (const step of steps) {
                    const cmd = step.cmd ?? `${step.argv?.command} ${step.argv?.args.join(' ')}`
                    process.stdout.write(`  - ${step.label}: ${cmd}\n`)
                }
                return
            }
            const code = await runPrecommit({ cwd, steps })
            process.exit(code)
        })

    const banner = await renderBanner()
    cli.help((sections) => {
        sections.unshift({ body: stripTrailingNewline(banner) })
    })
    cli.version(VERSION)

    const argv = process.argv.slice(2)
    if (argv.length === 0) {
        process.stdout.write(await renderHelp())
        return
    }
    cli.parse(['node', 'agentils-quality-gate', ...argv])
}

function mergeInitOptions(base: InitOptions, flags: InitFlags): InitOptions {
    const opts: InitOptions = { ...base }
    if (flags.cwd) opts.cwd = resolve(flags.cwd)
    if (flags.packageManager) {
        if (!isPackageManager(flags.packageManager)) {
            throw new Error(`unsupported package manager: ${flags.packageManager}`)
        }
        opts.packageManager = flags.packageManager
    }
    if (flags.prettierConfig !== undefined) opts.prettierConfig = flags.prettierConfig
    if (flags.prettierIgnore !== undefined) opts.prettierIgnore = flags.prettierIgnore
    if (flags.czrc !== undefined) opts.czrcConfig = flags.czrc
    if (flags.commitlintConfig !== undefined) opts.commitlintConfig = flags.commitlintConfig
    if (flags.lintStagedConfig !== undefined) opts.lintStagedConfig = flags.lintStagedConfig
    if (flags.huskyDir !== undefined) opts.huskyDir = flags.huskyDir
    if (flags.preCommitCommand !== undefined) opts.preCommitCommand = flags.preCommitCommand
    if (flags.commitMsgCommand !== undefined) opts.commitMsgCommand = flags.commitMsgCommand
    if (flags.withEslint) opts.withEslint = true
    if (flags.withTurbo) opts.withTurbo = true
    if (flags.install) opts.install = true
    if (flags.dryRun) opts.dryRun = true
    if (flags.agentilsHooks) opts.agentilsHooks = true
    if (flags.force) {
        opts.force = true
        opts.conflictStrategy = 'overwrite'
    }
    if (flags.conflict !== undefined) {
        if (!isConflictStrategy(flags.conflict)) {
            throw new Error(`unsupported conflict strategy: ${flags.conflict}`)
        }
        opts.conflictStrategy = flags.conflict
    }
    if (flags.merge) opts.conflictStrategy = 'merge'
    if (flags.skipExisting) opts.conflictStrategy = 'skip'
    if (flags.interactive !== undefined) opts.interactive = flags.interactive
    if (flags.packageJson === false) opts.packageJson = false
    if (flags.husky === false) opts.husky = false
    if (flags.prettier === false) opts.prettier = false
    if (flags.commitlint === false) opts.commitlint = false
    if (flags.lintStaged === false) opts.lintStaged = false
    return opts
}

function readPackageVersion(): string {
    try {
        const url = new URL('../package.json', import.meta.url)
        const raw = JSON.parse(readFileSync(url, 'utf8')) as { version?: unknown }
        return typeof raw.version === 'string' ? raw.version : '0.0.0'
    } catch {
        return '0.0.0'
    }
}

function stripTrailingNewline(value: string): string {
    return value.endsWith('\n') ? value.slice(0, -1) : value
}

main().catch((error) => {
    process.stderr.write(`\nagentils-quality-gate: ${(error as Error).message}\n`)
    process.exit(1)
})
