/**
 * Minimal JSON-file persisted store. Atomic via temp-file rename.
 * MVP — no concurrency control beyond serial async writes within one process.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { InteractionRequest, InteractionResponse, PersistedState } from '../types/index.js'

const EMPTY_STATE: PersistedState = {
  version: 1,
  requests: [],
  responses: {},
}

export class JsonStore {
  private state: PersistedState = EMPTY_STATE
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as PersistedState
      if (parsed.version === 1) {
        this.state = parsed
        return
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err
      }
    }
    this.state = { ...EMPTY_STATE, requests: [], responses: {} }
  }

  getRequest(id: string): InteractionRequest | undefined {
    return this.state.requests.find((r) => r.id === id)
  }

  listPending(): InteractionRequest[] {
    return this.state.requests.filter((r) => r.status === 'pending')
  }

  async upsertRequest(req: InteractionRequest): Promise<void> {
    const idx = this.state.requests.findIndex((r) => r.id === req.id)
    if (idx >= 0) {
      this.state.requests[idx] = req
    } else {
      this.state.requests.push(req)
    }
    await this.flush()
  }

  async putResponse(id: string, res: InteractionResponse): Promise<void> {
    this.state.responses[id] = res
    const req = this.getRequest(id)
    if (req) {
      req.status = res.cancelled ? 'cancelled' : 'submitted'
      await this.upsertRequest(req)
      return
    }
    await this.flush()
  }

  getResponse(id: string): InteractionResponse | undefined {
    return this.state.responses[id]
  }

  async heartbeat(id: string, now: number): Promise<void> {
    const req = this.getRequest(id)
    if (!req || req.status !== 'pending') return
    req.lastHeartbeatAt = now
    await this.upsertRequest(req)
  }

  async expirePending(now: number, timeoutMs: number): Promise<string[]> {
    const expired: string[] = []
    for (const req of this.state.requests) {
      if (req.status !== 'pending') continue
      if (now - req.lastHeartbeatAt > timeoutMs) {
        req.status = 'expired'
        expired.push(req.id)
      }
    }
    if (expired.length > 0) await this.flush()
    return expired
  }

  private async flush(): Promise<void> {
    const snapshot = JSON.stringify(this.state, null, 2)
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true })
      const tmp = `${this.filePath}.tmp`
      await writeFile(tmp, snapshot, 'utf8')
      await rename(tmp, this.filePath)
    })
    await this.writeQueue
  }
}
