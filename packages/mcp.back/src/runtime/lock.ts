import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export interface RuntimeLockInfo {
  pid: number
  port: number
  host: string
  endpoint: string
  url: string
  workspace: string
  startedAt: string
}

export interface AcquireLockResult {
  /** True if this process owns the lock (i.e. should start the server). */
  isOwner: boolean
  /** Lock info (existing peer's info if isOwner=false; reserved info if isOwner=true). */
  info: RuntimeLockInfo
  /** Path to the lock file on disk. */
  lockPath: string
  /** Release the lock. Safe to call when isOwner=false (no-op). */
  release: () => void
}

const LOCK_DIR_NAME = '.agentils'

function workspaceKey(workspace: string): string {
  return createHash('sha1').update(workspace).digest('hex').slice(0, 12)
}

function lockPathFor(workspace: string): string {
  return join(homedir(), LOCK_DIR_NAME, `runtime-${workspaceKey(workspace)}.lock`)
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EPERM') {
      // Process exists but we don't have permission to signal it.
      return true
    }
    return false
  }
}

function readLockFile(lockPath: string): RuntimeLockInfo | null {
  try {
    const raw = readFileSync(lockPath, 'utf8')
    const data = JSON.parse(raw) as RuntimeLockInfo
    if (
      typeof data.pid === 'number' &&
      typeof data.port === 'number' &&
      typeof data.host === 'string' &&
      typeof data.endpoint === 'string' &&
      typeof data.url === 'string'
    ) {
      return data
    }
    return null
  } catch {
    return null
  }
}

function writeLockFile(lockPath: string, info: RuntimeLockInfo): void {
  mkdirSync(dirname(lockPath), { recursive: true })
  writeFileSync(lockPath, `${JSON.stringify(info, null, 2)}\n`, 'utf8')
}

/**
 * Bug I fix: when the actually-bound port differs from what was reserved
 * (EADDRINUSE retry path), the owner must rewrite its lock file so peers
 * read the truthful url.
 */
export function updateLockPort(lockPath: string, info: RuntimeLockInfo, newPort: number): RuntimeLockInfo {
  const updated: RuntimeLockInfo = {
    ...info,
    port: newPort,
    url: `http://${info.host}:${newPort}${info.endpoint}`,
  }
  writeLockFile(lockPath, updated)
  return updated
}

async function pickFreePort(host: string, preferred?: number): Promise<number> {
  const tryPort = (port: number) =>
    new Promise<number | null>((resolve) => {
      const server = createServer()
      server.unref()
      server.once('error', () => resolve(null))
      server.listen(port, host, () => {
        const address = server.address()
        const actual = typeof address === 'object' && address ? address.port : port
        server.close(() => resolve(actual))
      })
    })

  // Bug J fix: vite-style sequential probing instead of jumping to a random
  // OS-assigned high port. Keeps the bound port within a small predictable
  // window of the preferred value, so .vscode/mcp.json stays close to the
  // canonical url and Copilot's MCP client cache rarely goes stale.
  if (preferred != null) {
    const MAX_INCREMENT = 100
    for (let offset = 0; offset <= MAX_INCREMENT; offset += 1) {
      const candidate = preferred + offset
      if (candidate > 65535) break
      const got = await tryPort(candidate)
      if (got != null) return got
    }
  }
  const got = await tryPort(0)
  if (got == null) {
    throw new Error('Failed to allocate a free port for AgentILS runtime')
  }
  return got
}

export interface AcquireLockOptions {
  /** Workspace root (used for lock key). Default: process.cwd(). */
  workspace?: string
  /** Preferred host (default 127.0.0.1). */
  host?: string
  /** Preferred port (default: env AGENTILS_HTTP_PORT or auto-allocate). */
  preferredPort?: number
  /** Endpoint path (default /mcp). */
  endpoint?: string
}

/**
 * Acquire the per-workspace runtime lock. If another live process already owns
 * the lock, returns its info with isOwner=false. Otherwise reserves a free port
 * and writes a fresh lock with isOwner=true.
 */
export async function acquireRuntimeLock(options: AcquireLockOptions = {}): Promise<AcquireLockResult> {
  const workspace = options.workspace ?? process.env.AGENTILS_WORKSPACE ?? process.cwd()
  const host = options.host ?? '127.0.0.1'
  const endpoint = options.endpoint ?? '/mcp'
  const lockPath = lockPathFor(workspace)

  const existing = existsSync(lockPath) ? readLockFile(lockPath) : null
  if (existing && isProcessAlive(existing.pid) && existing.pid !== process.pid) {
    return {
      isOwner: false,
      info: existing,
      lockPath,
      release: () => undefined,
    }
  }

  // Stale lock or no lock — claim it.
  // Bug B fix: default preferredPort to 8788 so the canonical mcp.json URL
  // (http://127.0.0.1:8788/mcp) actually points at the bound port. Falls
  // back to a random free port only if 8788 is genuinely occupied.
  const preferred =
    options.preferredPort ??
    (process.env.AGENTILS_HTTP_PORT ? Number(process.env.AGENTILS_HTTP_PORT) : 8788)
  const port = await pickFreePort(host, preferred)
  const info: RuntimeLockInfo = {
    pid: process.pid,
    port,
    host,
    endpoint,
    url: `http://${host}:${port}${endpoint}`,
    workspace,
    startedAt: new Date().toISOString(),
  }
  writeLockFile(lockPath, info)

  let released = false
  const release = () => {
    if (released) return
    released = true
    try {
      const current = readLockFile(lockPath)
      if (current && current.pid === process.pid) {
        unlinkSync(lockPath)
      }
    } catch {
      // best-effort
    }
  }

  return { isOwner: true, info, lockPath, release }
}
