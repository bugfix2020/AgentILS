import { existsSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const ANSI_RESET = '\u001B[0m'
const ANSI_GREEN = '\u001B[32m'
const ANSI_YELLOW = '\u001B[33m'
const ANSI_MUTED = '\u001B[2m'

interface PackageJsonRaw {
    scripts?: Record<string, string>
    [key: string]: unknown
}

export interface UninstallOptions {
    cwd: string
    huskyDir: string
    dryRun: boolean
}

export interface UninstallResult {
    huskyRemoved: boolean
    packageJsonUpdated: boolean
    removedScripts: string[]
}

/**
 * Reverse of `doInit`'s minimal footprint:
 *   1. delete `.husky/` (if present)
 *   2. drop the `prepare` / `commit` / `format` / `format:check` scripts that
 *      `mergePackageJson` injects (only when value still matches our default;
 *      otherwise leave it untouched so we never clobber user customizations)
 *
 * Intentionally **does not** remove prettier / commitlint / .czrc / lint-staged
 * configs or devDependencies — those may have been customized by the project
 * after init. Per plan FC3 the user removes them manually if desired.
 */
export async function doUninstall(options: UninstallOptions): Promise<UninstallResult> {
    const huskyPath = join(options.cwd, options.huskyDir)
    const packageJsonPath = join(options.cwd, 'package.json')

    const result: UninstallResult = {
        huskyRemoved: false,
        packageJsonUpdated: false,
        removedScripts: [],
    }

    if (existsSync(huskyPath)) {
        if (!options.dryRun) await rm(huskyPath, { recursive: true, force: true })
        result.huskyRemoved = true
    }

    if (existsSync(packageJsonPath)) {
        const raw = await readFile(packageJsonPath, 'utf8')
        const packageJson = JSON.parse(raw) as PackageJsonRaw
        const defaults: Record<string, string> = {
            prepare: 'husky',
            commit: 'git-cz',
            format: 'prettier --write .',
            'format:check': 'prettier --check .',
        }
        if (packageJson.scripts) {
            const scripts = { ...packageJson.scripts }
            for (const [name, expected] of Object.entries(defaults)) {
                if (scripts[name] === expected) {
                    delete scripts[name]
                    result.removedScripts.push(name)
                }
            }
            if (result.removedScripts.length > 0) {
                packageJson.scripts = scripts
                if (!options.dryRun) {
                    const incoming = `${JSON.stringify(packageJson, null, 4)}\n`
                    await writeFile(packageJsonPath, incoming, 'utf8')
                }
                result.packageJsonUpdated = true
            }
        }
    }

    printReport(options, result)
    return result
}

function printReport(options: UninstallOptions, result: UninstallResult): void {
    const supports = process.stdout.isTTY && process.env.NO_COLOR === undefined
    const c = (text: string, code: string) => (supports ? `${code}${text}${ANSI_RESET}` : text)

    if (options.dryRun) process.stdout.write(`${c('Dry run: no files were modified.', ANSI_YELLOW)}\n`)
    if (result.huskyRemoved) {
        process.stdout.write(`${c('removed', ANSI_GREEN)} ${c(join(options.cwd, options.huskyDir), ANSI_MUTED)}\n`)
    } else {
        process.stdout.write(
            `${c('skip', ANSI_MUTED)} ${c(`${join(options.cwd, options.huskyDir)} (not found)`, ANSI_MUTED)}\n`,
        )
    }
    if (result.removedScripts.length > 0) {
        process.stdout.write(
            `${c('updated', ANSI_GREEN)} package.json — removed scripts: ${result.removedScripts.join(', ')}\n`,
        )
    } else {
        process.stdout.write(`${c('skip', ANSI_MUTED)} package.json (no AgentILS-default scripts to remove)\n`)
    }
    process.stdout.write(`\n${c('Uninstall complete.', ANSI_GREEN)}\n`)
}
