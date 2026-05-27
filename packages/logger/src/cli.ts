#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync, createWriteStream, renameSync, mkdirSync, chmodSync } from 'node:fs'
import { createRequire } from 'node:module'
import { get } from 'node:https'
import { homedir } from 'node:os'
import { join, delimiter } from 'node:path'

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

const PLATFORM_ARCH_MAP: Record<string, Record<string, string>> = {
    darwin: { arm64: 'darwin-arm64', x64: 'darwin-amd64' },
    linux: { x64: 'linux-amd64' },
    win32: { x64: 'windows-amd64' },
}

function getPlatformArch(): string {
    const archMap = PLATFORM_ARCH_MAP[process.platform]
    if (!archMap) {
        writeStderr(
            `Unsupported platform: ${process.platform}-${process.arch}\n` +
                'The agent-ils-logger binary is available for: darwin-arm64, darwin-amd64, linux-amd64, windows-amd64',
        )
        process.exit(1)
    }
    const platformArch = archMap[process.arch]
    if (!platformArch) {
        writeStderr(
            `Unsupported platform: ${process.platform}-${process.arch}\n` +
                'The agent-ils-logger binary is available for: darwin-arm64, darwin-amd64, linux-amd64, windows-amd64',
        )
        process.exit(1)
    }
    return platformArch
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeStderr(value: string): void {
    process.stderr.write(`${value}\n`)
}

function readPackageVersion(): string {
    try {
        const require = createRequire(import.meta.url)
        const packageJson = require('../package.json') as { version?: unknown }
        return typeof packageJson.version === 'string' ? packageJson.version : '0.0.0'
    } catch {
        return '0.0.0'
    }
}

function getBinaryName(platformArch: string): string {
    const isWindows = platformArch.startsWith('windows')
    return isWindows ? 'agent-ils-logger.exe' : 'agent-ils-logger'
}

function getCachedBinaryName(platformArch: string): string {
    const isWindows = platformArch.startsWith('windows')
    return isWindows ? `agent-ils-logger-${platformArch}.exe` : `agent-ils-logger-${platformArch}`
}

function getCacheDir(): string {
    return join(homedir(), '.agent-ils', 'bin')
}

// ---------------------------------------------------------------------------
// Locate binary: PATH scan -> cache dir
// ---------------------------------------------------------------------------

function findInPath(binaryName: string): string | null {
    const pathEnv = process.env.PATH
    if (!pathEnv) return null
    const dirs = pathEnv.split(delimiter)
    for (const dir of dirs) {
        const candidate = join(dir, binaryName)
        if (existsSync(candidate)) return candidate
    }
    return null
}

function findInCache(cachedBinaryName: string): string | null {
    const cachePath = join(getCacheDir(), cachedBinaryName)
    if (existsSync(cachePath)) return cachePath
    return null
}

// ---------------------------------------------------------------------------
// Download binary from GitHub Release
// ---------------------------------------------------------------------------

function downloadBinary(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const tmpPath = dest + '.tmp'
        const dir = join(dest, '..')
        mkdirSync(dir, { recursive: true })
        const file = createWriteStream(tmpPath)
        get(url, { headers: { 'User-Agent': '@agent-ils/logger' } }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                file.close()
                if (res.headers.location) {
                    downloadBinary(res.headers.location, dest).then(resolve).catch(reject)
                } else {
                    reject(new Error('Redirect without Location header'))
                }
                return
            }
            if (res.statusCode !== 200) {
                file.close()
                reject(new Error(`HTTP ${res.statusCode}`))
                return
            }
            res.pipe(file)
            file.on('finish', () => {
                file.close()
                renameSync(tmpPath, dest)
                if (process.platform !== 'win32') {
                    chmodSync(dest, 0o755)
                }
                resolve()
            })
        }).on('error', (err) => {
            file.close()
            reject(err)
        })
    })
}

function printInstallHelp(): void {
    writeStderr(
        'Failed to download agent-ils-logger binary.\n' +
            '\n' +
            'Install options:\n' +
            '  macOS:  brew tap bugfix2020/agentils && brew install agent-ils-logger\n' +
            '  Windows: winget install bugfix2020.AgentILS.Logger\n' +
            '  Linux:   Download from https://github.com/bugfix2020/AgentILS/releases\n' +
            '\n' +
            'Or build from source: cd packages/logger-collector && go build -o agent-ils-logger .',
    )
}

// ---------------------------------------------------------------------------
// Main: locate/download -> exec
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
    const platformArch = getPlatformArch()
    const binaryName = getBinaryName(platformArch)
    const cachedBinaryName = getCachedBinaryName(platformArch)

    // 1. Check PATH
    let binaryPath = findInPath(binaryName)

    // 2. Check cache dir
    if (!binaryPath) {
        binaryPath = findInCache(cachedBinaryName)
    }

    // 3. Download if not found
    if (!binaryPath) {
        const version = readPackageVersion()
        const downloadName = platformArch.startsWith('windows')
            ? `agent-ils-logger-${platformArch}.exe`
            : `agent-ils-logger-${platformArch}`
        const url = `https://github.com/bugfix2020/AgentILS/releases/download/v${version}/${downloadName}`
        const cacheDir = getCacheDir()
        const dest = join(cacheDir, cachedBinaryName)

        try {
            await downloadBinary(url, dest)
            binaryPath = dest
        } catch {
            printInstallHelp()
            process.exit(1)
        }
    }

    // 4. Execute the binary
    const child = spawn(binaryPath, process.argv.slice(2), {
        stdio: 'inherit',
        env: { ...process.env, AGENT_ILS_INVOKER: 'npx' },
    })

    process.on('SIGINT', () => child.kill('SIGINT'))
    process.on('SIGTERM', () => child.kill('SIGTERM'))

    child.on('exit', (code) => {
        process.exitCode = code ?? 1
    })
}

main().catch((error) => {
    writeStderr(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
})
