import { existsSync } from 'node:fs'
import { access, chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, parse, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { cancel, isCancel, select } from '@clack/prompts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const TEMPLATE_DIRS = [join(__dirname, 'templates'), join(__dirname, '..', 'templates')]
const ANSI_RESET = '\u001B[0m'
const ANSI_GREEN = '\u001B[32m'
const ANSI_RED = '\u001B[31m'
const ANSI_LIGHT_GRAY = '\u001B[38;2;191;191;191m'
const ANSI_MUTED_GRAY = '\u001B[2m'
const ANSI_YELLOW = '\u001B[33m'

const STAT_GRAPH_WIDTH = 10
const BANNER_COLORS = [
    '\u001B[38;5;75m',
    '\u001B[38;5;105m',
    '\u001B[38;5;141m',
    '\u001B[38;5;175m',
    '\u001B[38;5;204m',
]

export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun'
export type ConflictStrategy = 'overwrite' | 'merge' | 'skip' | 'cancel'

export interface InitOptions {
    cwd: string
    packageManager?: PackageManager
    prettierConfig: string
    prettierIgnore: string
    czrcConfig: string
    commitlintConfig: string
    lintStagedConfig: string
    huskyDir: string
    preCommitCommand: string
    commitMsgCommand: string
    withEslint: boolean
    withTurbo: boolean
    install: boolean
    dryRun: boolean
    force: boolean
    agentilsHooks: boolean
    conflictStrategy?: ConflictStrategy
    interactive?: boolean
    packageJson: boolean
    husky: boolean
    prettier: boolean
    commitlint: boolean
    lintStaged: boolean
}

export function createDefaultInitOptions(cwd: string = process.cwd()): InitOptions {
    return {
        cwd,
        prettierConfig: 'prettier.config.mjs',
        prettierIgnore: '.prettierignore',
        czrcConfig: '.czrc',
        commitlintConfig: 'commitlint.config.mjs',
        lintStagedConfig: 'lint-staged.config.mjs',
        huskyDir: '.husky',
        preCommitCommand: '{pm} exec lint-staged',
        commitMsgCommand: '{pm} exec commitlint --edit "$1"',
        withEslint: false,
        withTurbo: false,
        install: false,
        dryRun: false,
        force: false,
        agentilsHooks: false,
        conflictStrategy: undefined,
        interactive: undefined,
        packageJson: true,
        husky: true,
        prettier: true,
        commitlint: true,
        lintStaged: true,
    }
}

interface PackageJson {
    packageManager?: string
    scripts?: Record<string, string>
    devDependencies?: Record<string, string>
    config?: Record<string, unknown>
    [key: string]: unknown
}

const DEV_DEPENDENCIES: Record<string, string> = {
    '@commitlint/cli': '^19.8.0',
    '@commitlint/config-conventional': '^19.8.0',
    commitizen: '^4.3.1',
    'conventional-changelog-cli': '^5.0.0',
    'cz-conventional-changelog': '^3.3.0',
    husky: '^9.1.7',
    'lint-staged': '^16.4.0',
    prettier: '^3.5.3',
}

function isPackageManager(value: string): value is PackageManager {
    return value === 'pnpm' || value === 'npm' || value === 'yarn' || value === 'bun'
}

function isConflictStrategy(value: string): value is ConflictStrategy {
    return value === 'overwrite' || value === 'merge' || value === 'skip' || value === 'cancel'
}

export { isPackageManager, isConflictStrategy }

async function readPackageJson(cwd: string): Promise<PackageJson> {
    const packageJsonPath = join(cwd, 'package.json')
    try {
        return JSON.parse(await readFile(packageJsonPath, 'utf8')) as PackageJson
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { name: parse(cwd).base, version: '0.1.0' }
        throw new Error(`cannot read ${packageJsonPath}: ${(error as Error).message}`)
    }
}

interface LockMatch {
    packageManager: PackageManager
    lockFile: string
    root: string
}

const LOCKFILE_TABLE: ReadonlyArray<{ file: string; packageManager: PackageManager }> = [
    { file: 'pnpm-lock.yaml', packageManager: 'pnpm' },
    { file: 'package-lock.json', packageManager: 'npm' },
    { file: 'npm-shrinkwrap.json', packageManager: 'npm' },
    { file: 'yarn.lock', packageManager: 'yarn' },
    { file: 'bun.lockb', packageManager: 'bun' },
    { file: 'bun.lock', packageManager: 'bun' },
]

function packageManagerFromField(packageJson: PackageJson): PackageManager | undefined {
    const pm = packageJson.packageManager?.split('@')[0]
    return pm && isPackageManager(pm) ? pm : undefined
}

function findLockMatchesAt(dir: string): LockMatch[] {
    const matches: LockMatch[] = []
    for (const { file, packageManager } of LOCKFILE_TABLE) {
        if (existsSync(join(dir, file))) matches.push({ packageManager, lockFile: file, root: dir })
    }
    return matches
}

function findAllLockMatches(cwd: string): LockMatch[] {
    let current = resolve(cwd)
    while (true) {
        const matches = findLockMatchesAt(current)
        if (matches.length > 0) return matches
        const parent = dirname(current)
        if (parent === current) return []
        current = parent
    }
}

async function detectPackageManager(cwd: string, packageJson: PackageJson): Promise<PackageManager> {
    const matches = findAllLockMatches(cwd)
    const distinct = new Set(matches.map((match) => match.packageManager))

    if (distinct.size === 1) return matches[0].packageManager

    const fieldPm = packageManagerFromField(packageJson)

    if (matches.length > 0 && distinct.size > 1) {
        if (fieldPm) {
            const others = matches.filter((match) => match.packageManager !== fieldPm)
            if (others.length > 0) {
                const list = others.map((match) => `${match.lockFile} (${match.packageManager})`).join(', ')
                process.stderr.write(
                    `${colorize(
                        `! multiple lockfiles detected; using package.json packageManager=${fieldPm}. ` +
                            `Stale lockfile(s) to clean up: ${list}.`,
                        ANSI_YELLOW,
                    )}\n`,
                )
            }
            return fieldPm
        }
        return promptForPackageManagerOrThrow(matches)
    }

    if (fieldPm) return fieldPm
    return promptForPackageManagerOrThrow([])
}

async function promptForPackageManagerOrThrow(matches: LockMatch[]): Promise<PackageManager> {
    const interactive = process.stdin.isTTY
    if (!interactive) {
        const detail =
            matches.length > 0
                ? `Multiple lockfiles detected: ${matches
                      .map((match) => `${match.lockFile} (${match.packageManager})`)
                      .join(', ')}. ` + 'Set package.json "packageManager" or pass --package-manager.'
                : 'No lockfile found and package.json has no "packageManager" field. ' +
                  'Pass --package-manager to choose one of pnpm/npm/yarn/bun.'
        throw new Error(detail)
    }

    const message =
        matches.length > 0
            ? `Multiple lockfiles detected (${matches
                  .map((match) => `${match.lockFile}`)
                  .join(', ')}). Pick the package manager to use:`
            : 'No lockfile or packageManager field found. Pick the package manager to use:'

    const answer = await select<PackageManager>({
        message,
        options: [
            { label: 'pnpm', value: 'pnpm' },
            { label: 'npm', value: 'npm' },
            { label: 'yarn', value: 'yarn' },
            { label: 'bun', value: 'bun' },
        ],
    })
    if (isCancel(answer)) {
        cancel('Package manager selection cancelled.')
        throw new Error('package manager selection cancelled')
    }
    return answer
}

interface PlannedFile {
    path: string
    body: string
    executable?: boolean
}

interface ChangeStat {
    path: string
    additions: number
    deletions: number
}

function mergeUniqueLines(existing: string, incoming: string): string {
    const existingLines = existing.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n')
    const existingSet = new Set(existingLines.filter((line) => line.length > 0))
    const merged = [...existingLines]

    for (const line of incoming.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n')) {
        if (line.length > 0 && existingSet.has(line)) continue
        merged.push(line)
        if (line.length > 0) existingSet.add(line)
    }

    return `${merged.join('\n')}\n`
}

function canMergeByLines(path: string): boolean {
    return path.endsWith('.prettierignore')
}

function linesForDiff(body: string): string[] {
    if (body.length === 0) return []
    return body.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n')
}

function countLineChanges(existing: string, incoming: string): Pick<ChangeStat, 'additions' | 'deletions'> {
    const oldLines = linesForDiff(existing)
    const newLines = linesForDiff(incoming)
    const table = Array.from({ length: oldLines.length + 1 }, () => Array<number>(newLines.length + 1).fill(0))

    for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex--) {
        for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex--) {
            table[oldIndex][newIndex] =
                oldLines[oldIndex] === newLines[newIndex]
                    ? table[oldIndex + 1][newIndex + 1] + 1
                    : Math.max(table[oldIndex + 1][newIndex], table[oldIndex][newIndex + 1])
        }
    }

    const unchanged = table[0][0]
    return {
        additions: newLines.length - unchanged,
        deletions: oldLines.length - unchanged,
    }
}

function pushChangeStat(stats: ChangeStat[], path: string, existing: string, incoming: string): void {
    const { additions, deletions } = countLineChanges(existing, incoming)
    if (additions > 0 || deletions > 0) stats.push({ path, additions, deletions })
}

function pushWriteStat(stats: ChangeStat[], path: string, existing: string, incoming: string): void {
    const { additions, deletions } = countLineChanges(existing, incoming)
    if (additions > 0 || deletions > 0) {
        stats.push({ path, additions, deletions })
        return
    }
    if (existing.length === 0) return
    const rewriteLines = linesForDiff(incoming).length
    if (rewriteLines > 0) stats.push({ path, additions: rewriteLines, deletions: rewriteLines })
}

async function writeWithConflictStrategy(
    path: string,
    body: string,
    strategy: ConflictStrategy,
    written: string[],
    skipped: string[],
    merged: string[],
    stats: ChangeStat[],
    dryRun: boolean,
): Promise<void> {
    const exists = existsSync(path)
    if (exists && strategy === 'skip') {
        skipped.push(path)
        return
    }

    if (exists && strategy === 'merge') {
        if (!canMergeByLines(path)) {
            skipped.push(path)
            return
        }
        const existing = await readFile(path, 'utf8')
        const mergedBody = mergeUniqueLines(existing, body)
        if (mergedBody === existing) {
            skipped.push(path)
            return
        }
        pushChangeStat(stats, path, existing, mergedBody)
        if (dryRun) {
            merged.push(path)
            return
        }
        await writeFile(path, mergedBody, 'utf8')
        merged.push(path)
        return
    }

    const existing = exists ? await readFile(path, 'utf8') : ''
    pushWriteStat(stats, path, existing, body)
    if (dryRun) {
        written.push(path)
        return
    }
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, body, 'utf8')
    written.push(path)
}

async function chooseConflictStrategy(options: InitOptions, conflicts: string[]): Promise<ConflictStrategy> {
    if (conflicts.length === 0) return 'skip'
    if (options.conflictStrategy) return options.conflictStrategy

    const interactive = options.interactive ?? process.stdin.isTTY
    if (!interactive) return 'skip'

    const answer = await select<ConflictStrategy>({
        message: `Detected ${conflicts.length} existing config/hook file(s). How should AgentILS proceed?`,
        options: [
            { label: 'Overwrite existing files', value: 'overwrite' },
            { label: 'Merge supported files and skip the rest', value: 'merge' },
            { label: 'Skip existing files', value: 'skip' },
            { label: 'Cancel operation', value: 'cancel' },
        ],
    })

    if (isCancel(answer)) return 'cancel'
    return answer
}

async function readTemplate(relativePath: string, replacements: Record<string, string> = {}): Promise<string> {
    let body: string | undefined
    for (const templatesDir of TEMPLATE_DIRS) {
        try {
            body = await readFile(join(templatesDir, relativePath), 'utf8')
            break
        } catch {
            // Try the next template directory. Built packages use dist/templates; source runs use ../templates.
        }
    }
    if (body === undefined) throw new Error(`template not found: ${relativePath}`)
    for (const [key, value] of Object.entries(replacements)) {
        body = body.replaceAll(`{{${key}}}`, value)
    }
    return body
}

function interpolateCommand(command: string, packageManager: PackageManager): string {
    return command.replaceAll('{pm}', packageManager)
}

function supportsAnsi(): boolean {
    return process.stdout.isTTY && process.env.NO_COLOR === undefined && process.env.TERM !== 'dumb'
}

function colorize(text: string, color: string): string {
    if (!supportsAnsi()) return text
    return `${color}${text}${ANSI_RESET}`
}

function colorizeBanner(banner: string): string {
    if (!supportsAnsi()) return banner
    return banner
        .split('\n')
        .map((line) =>
            [...line]
                .map((character, index) => {
                    if (character === ' ') return character
                    const color =
                        BANNER_COLORS[Math.floor((index / Math.max(line.length - 1, 1)) * (BANNER_COLORS.length - 1))]
                    return `${color}${character}${ANSI_RESET}`
                })
                .join(''),
        )
        .join('\n')
}

async function renderBanner(): Promise<string> {
    return colorizeBanner(await readTemplate('banner.txt'))
}

async function renderHelp(): Promise<string> {
    return `${await renderBanner()}\n${await readTemplate('help.txt')}\n`
}

function mergePackageJson(packageJson: PackageJson, options: InitOptions): PackageJson {
    const scripts = { ...(packageJson.scripts ?? {}) }
    const devDependencies = { ...(packageJson.devDependencies ?? {}) }

    scripts.prepare ??= 'husky'
    scripts.commit ??= 'git-cz'
    scripts.format ??= 'prettier --write .'
    scripts['format:check'] ??= 'prettier --check .'
    scripts.changelog ??= 'conventional-changelog -p conventionalcommits -i CHANGELOG.md -s'
    scripts['changelog:all'] ??= 'conventional-changelog -p conventionalcommits -i CHANGELOG.md -s -r 0'
    scripts['generate:changelog'] ??= 'conventional-changelog -p conventionalcommits -i CHANGELOG.md -s'
    scripts['generate:changelog:first'] ??= 'conventional-changelog -p conventionalcommits -i CHANGELOG.md -s -r 0'

    if (options.withEslint) {
        scripts.lint ??= 'eslint .'
        scripts['lint:fix'] ??= 'eslint . --fix'
    }

    let dependencies: Record<string, string> = { ...DEV_DEPENDENCIES }
    if (options.withEslint) {
        dependencies = {
            ...dependencies,
            eslint: '^9.25.0',
            '@eslint/js': '^9.25.0',
            'typescript-eslint': '^8.31.0',
        }
    }
    if (options.withTurbo) {
        dependencies = { ...dependencies, turbo: '^2.9.6' }
    }
    for (const [name, version] of Object.entries(dependencies)) {
        devDependencies[name] ??= version
    }

    return {
        ...packageJson,
        scripts,
        devDependencies,
    }
}

async function writePackageJson(
    cwd: string,
    packageJson: PackageJson,
    written: string[],
    stats: ChangeStat[],
    dryRun: boolean,
): Promise<void> {
    const packageJsonPath = join(cwd, 'package.json')
    const existing = existsSync(packageJsonPath) ? await readFile(packageJsonPath, 'utf8') : ''
    const incoming = `${JSON.stringify(packageJson, null, 4)}\n`
    pushWriteStat(stats, packageJsonPath, existing, incoming)
    if (dryRun) {
        written.push(packageJsonPath)
        return
    }
    await writeFile(packageJsonPath, incoming, 'utf8')
    written.push(packageJsonPath)
}

function colorizeChangeMarker(marker: string, color: string): string {
    return colorize(marker, color)
}

function scaleStatGraph(
    stat: ChangeStat,
    maxTotal: number,
    graphWidth: number,
): Pick<ChangeStat, 'additions' | 'deletions'> {
    const additions = stat.additions > 0 ? Math.max(1, Math.round((stat.additions / maxTotal) * graphWidth)) : 0
    const deletions = stat.deletions > 0 ? Math.max(1, Math.round((stat.deletions / maxTotal) * graphWidth)) : 0
    const overflow = additions + deletions - graphWidth
    if (overflow <= 0) return { additions, deletions }
    if (additions >= deletions)
        return { additions: Math.max(stat.additions > 0 ? 1 : 0, additions - overflow), deletions }
    return { additions, deletions: Math.max(stat.deletions > 0 ? 1 : 0, deletions - overflow) }
}

function formatChangeStat(stat: ChangeStat, pathWidth: number, maxTotal: number): string {
    const total = stat.additions + stat.deletions
    const graphWidth = Math.min(STAT_GRAPH_WIDTH, maxTotal)
    const graph = scaleStatGraph(stat, maxTotal, graphWidth)
    const additions = graph.additions > 0 ? colorizeChangeMarker('+'.repeat(graph.additions), ANSI_GREEN) : ''
    const deletions = graph.deletions > 0 ? colorizeChangeMarker('-'.repeat(graph.deletions), ANSI_RED) : ''
    return ` ${stat.path.padEnd(pathWidth)} | ${String(total).padStart(5)} ${additions}${deletions}`
}

function printChangeStats(stats: ChangeStat[]): void {
    if (stats.length === 0) return
    const pathWidth = Math.max(...stats.map((stat) => stat.path.length))
    const maxTotal = Math.max(...stats.map((stat) => stat.additions + stat.deletions))
    for (const stat of stats) process.stdout.write(`${formatChangeStat(stat, pathWidth, maxTotal)}\n`)
}

function shouldWritePackageJson(options: InitOptions): boolean {
    return options.packageJson
}

async function runInstall(cwd: string, packageManager: PackageManager): Promise<void> {
    if (!existsSync(join(cwd, 'package.json'))) {
        throw new Error(`cannot run ${packageManager} install: ${join(cwd, 'package.json')} does not exist`)
    }
    const args = ['install']
    await new Promise<void>((resolvePromise, rejectPromise) => {
        const child = spawn(packageManager, args, { cwd, stdio: 'inherit' })
        child.on('exit', (code: number | null) => {
            if (code === 0) resolvePromise()
            else rejectPromise(new Error(`${packageManager} install exited with code ${code ?? 'unknown'}`))
        })
        child.on('error', rejectPromise)
    })
}

async function ensureTarget(cwd: string): Promise<void> {
    try {
        await access(cwd)
    } catch {
        throw new Error(`target directory does not exist: ${cwd}`)
    }
}

export async function doInit(options: InitOptions): Promise<void> {
    await ensureTarget(options.cwd)
    const packageJson = await readPackageJson(options.cwd)
    const packageManager = options.packageManager ?? (await detectPackageManager(options.cwd, packageJson))
    const written: string[] = []
    const skipped: string[] = []
    const merged: string[] = []
    const stats: ChangeStat[] = []
    const plannedFiles: PlannedFile[] = []

    if (options.prettier) {
        plannedFiles.push(
            { path: join(options.cwd, options.prettierConfig), body: await readTemplate('prettier.config.mjs') },
            { path: join(options.cwd, options.prettierIgnore), body: await readTemplate('.prettierignore') },
        )
    }

    plannedFiles.push({ path: join(options.cwd, options.czrcConfig), body: await readTemplate('.czrc') })

    if (options.commitlint) {
        plannedFiles.push({
            path: join(options.cwd, options.commitlintConfig),
            body: await readTemplate('commitlint.config.mjs'),
        })
    }

    if (options.lintStaged) {
        const lintStagedTemplate = options.withEslint
            ? 'lint-staged.eslint.config.mjs'
            : 'lint-staged.prettier.config.mjs'
        plannedFiles.push({
            path: join(options.cwd, options.lintStagedConfig),
            body: await readTemplate(lintStagedTemplate),
        })
    }

    if (options.withEslint) {
        plannedFiles.push({
            path: join(options.cwd, 'eslint.config.mjs'),
            body: await readTemplate('eslint.config.mjs'),
        })
    }

    if (options.withTurbo) {
        plannedFiles.push({
            path: join(options.cwd, 'turbo.json'),
            body: await readTemplate('turbo.json'),
        })
    }

    if (options.husky) {
        const huskyDir = join(options.cwd, options.huskyDir)
        if (options.lintStaged) {
            const preCommitTemplate = options.agentilsHooks ? 'husky/agentils/pre-commit' : 'husky/pre-commit'
            plannedFiles.push({
                path: join(huskyDir, 'pre-commit'),
                body: await readTemplate(preCommitTemplate, {
                    command: interpolateCommand(options.preCommitCommand, packageManager),
                }),
                executable: true,
            })
        }
        if (options.commitlint) {
            const commitMsgTemplate = options.agentilsHooks ? 'husky/agentils/commit-msg' : 'husky/commit-msg'
            plannedFiles.push({
                path: join(huskyDir, 'commit-msg'),
                body: await readTemplate(commitMsgTemplate, {
                    command: interpolateCommand(options.commitMsgCommand, packageManager),
                }),
                executable: true,
            })
        }
    }

    const conflicts = plannedFiles.filter((file) => existsSync(file.path)).map((file) => file.path)
    const conflictStrategy = await chooseConflictStrategy(options, conflicts)
    if (conflictStrategy === 'cancel') {
        cancel('Operation cancelled')
        return
    }

    if (shouldWritePackageJson(options)) {
        await writePackageJson(options.cwd, mergePackageJson(packageJson, options), written, stats, options.dryRun)
    }

    for (const file of plannedFiles) {
        await writeWithConflictStrategy(
            file.path,
            file.body,
            conflictStrategy,
            written,
            skipped,
            merged,
            stats,
            options.dryRun,
        )
        if (!options.dryRun && file.executable && written.includes(file.path)) await chmod(file.path, 0o755)
    }

    if (options.install && !options.dryRun) await runInstall(options.cwd, packageManager)

    process.stdout.write(`${await renderBanner()}\n`)
    if (options.dryRun) process.stdout.write('Dry run: no files were written.\n')
    process.stdout.write(`${colorize(`Package manager: ${packageManager}`, ANSI_LIGHT_GRAY)}\n`)
    printChangeStats(stats)
    if (merged.length > 0) {
        process.stdout.write(`\n`)
        process.stdout.write(`${colorize('The following files were merged:', ANSI_GREEN)}\n`)
        for (const path of merged) process.stdout.write(` ${colorize(path, ANSI_MUTED_GRAY)}\n`)
    }
    if (skipped.length > 0) {
        const skippedTitle =
            conflictStrategy === 'merge'
                ? 'The following files cannot be merged safely:'
                : 'The following files were skipped:'
        process.stdout.write(`\n`)
        process.stdout.write(`${colorize(skippedTitle, ANSI_YELLOW)}\n`)
        for (const path of skipped) process.stdout.write(` ${colorize(path, ANSI_MUTED_GRAY)}\n`)
        process.stdout.write(`\n`)
        process.stdout.write(
            `${colorize('Run again with --force or --conflict overwrite to overwrite skipped files.', ANSI_RESET)}\n`,
        )
    }

    process.stdout.write(`\n`)
    process.stdout.write(`${colorize(`Success: AgentILS quality gate initialized in ${options.cwd}`, ANSI_GREEN)}\n`)
}

export { renderHelp, renderBanner }
