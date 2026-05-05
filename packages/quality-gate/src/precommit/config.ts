import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { BUILTIN_FALLBACK_STEPS, type StepDefinition } from './steps.js'

/**
 * Recognized config file names, in lookup priority order. Mirrors ESLint's
 * flat-config convention: a fixed file-name set, no rc / yaml / package.json
 * field discovery. `.ts` variants require either Node >= 22.13 with
 * `--experimental-strip-types` or a registered loader (e.g. `jiti`). When
 * dynamic import fails for a `.ts*` file we surface a hint pointing at jiti.
 */
export const CONFIG_FILE_NAMES = [
    'agentils-gate.config.js',
    'agentils-gate.config.mjs',
    'agentils-gate.config.cjs',
    'agentils-gate.config.ts',
    'agentils-gate.config.mts',
    'agentils-gate.config.cts',
] as const

export interface UserConfig {
    steps: StepDefinition[]
}

export interface ResolvedConfig {
    /** Absolute path of the config file actually loaded. `null` => fallback. */
    source: string | null
    /** Final step list handed to the runner. Always non-empty. */
    steps: StepDefinition[]
}

/**
 * Walk up from `startDir` until a config file is found or the filesystem root
 * is reached. Within a single directory, candidates are tested in
 * `CONFIG_FILE_NAMES` order (`.js` wins over `.mjs` wins over `.cjs` ...).
 */
export function findConfigFile(startDir: string): string | null {
    let dir = resolve(startDir)
    for (;;) {
        for (const name of CONFIG_FILE_NAMES) {
            const candidate = join(dir, name)
            if (existsSync(candidate)) return candidate
        }
        const parent = dirname(dir)
        if (parent === dir) return null
        dir = parent
    }
}

/**
 * Dynamic-import a config file and validate its default export. Adds a hint
 * about installing `jiti` when a `.ts*` file fails to load.
 */
export async function loadConfigFile(file: string): Promise<UserConfig> {
    let mod: { default?: unknown } & Record<string, unknown>
    try {
        mod = (await import(pathToFileURL(file).href)) as typeof mod
    } catch (err) {
        if (/\.[mc]?ts$/.test(file)) {
            throw new Error(
                `Failed to load TypeScript config "${file}". Install \`jiti\` (>=2.2) or run Node \u2265 22.13 with \`--experimental-strip-types\`. Underlying error: ${(err as Error).message}`,
            )
        }
        throw new Error(`Failed to load config "${file}": ${(err as Error).message}`)
    }
    const exported = (mod.default ?? mod) as unknown
    return validateConfig(exported, file)
}

function validateConfig(cfg: unknown, file: string): UserConfig {
    if (!cfg || typeof cfg !== 'object') {
        throw new Error(`Config "${file}" must export an object with a \`steps\` array`)
    }
    const c = cfg as Partial<UserConfig>
    if (!Array.isArray(c.steps) || c.steps.length === 0) {
        throw new Error(`Config "${file}" \`steps\` must be a non-empty array`)
    }
    c.steps.forEach((raw, i) => {
        if (!raw || typeof raw !== 'object') {
            throw new Error(`Config "${file}" steps[${i}] must be an object`)
        }
        const step = raw as StepDefinition
        if (typeof step.label !== 'string' || step.label.trim().length === 0) {
            throw new Error(`Config "${file}" steps[${i}].label must be a non-empty string`)
        }
        const hasCmd = typeof step.cmd === 'string' && step.cmd.length > 0
        const hasArgv = !!step.argv && typeof step.argv === 'object' && Array.isArray(step.argv.args)
        if (hasCmd === hasArgv) {
            throw new Error(
                `Config "${file}" steps[${i}] must set exactly one of \`cmd\` (string) or \`argv\` ({command,args})`,
            )
        }
        if (step.render !== undefined && typeof step.render !== 'function') {
            throw new Error(`Config "${file}" steps[${i}].render must be a function returning a string`)
        }
    })
    return c as UserConfig
}

/**
 * Top-level entry: resolve the effective config for a given cwd.
 *
 * - If `explicit` is provided (e.g. from `--config`), it is used directly and
 *   must exist. No upward search is performed.
 * - Otherwise we walk up from `cwd` looking for any `CONFIG_FILE_NAMES` match.
 * - If nothing is found, return `BUILTIN_FALLBACK_STEPS` (a single
 *   `pnpm exec lint-staged`) so the runner is always usable out of the box.
 */
export async function resolveConfig(cwd: string, explicit?: string): Promise<ResolvedConfig> {
    let file: string | null = null
    if (explicit) {
        file = isAbsolute(explicit) ? explicit : resolve(cwd, explicit)
        if (!existsSync(file)) throw new Error(`--config file not found: ${file}`)
    } else {
        file = findConfigFile(cwd)
    }
    if (!file) {
        return { source: null, steps: BUILTIN_FALLBACK_STEPS }
    }
    const cfg = await loadConfigFile(file)
    return { source: file, steps: cfg.steps }
}
