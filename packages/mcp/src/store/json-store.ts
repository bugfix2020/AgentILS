/**
 * Minimal JSON-file persisted store. Atomic via temp-file rename.
 * MVP — no concurrency control beyond serial async writes within one process.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { InteractionRequest, InteractionResponse, PersistedState } from '../types/index.js'
import { createLogger } from '../util/logger.js'
import type { InteractionStore } from './interaction-store.js'

const log = createLogger('store')

const EMPTY_STATE: PersistedState = {
    version: 1,
    requests: [],
    responses: {},
}

export class JsonStore implements InteractionStore {
    private state: PersistedState = EMPTY_STATE
    private writeQueue: Promise<void> = Promise.resolve()

    constructor(private readonly filePath: string) {}

    async load(): Promise<void> {
        try {
            const raw = await readFile(this.filePath, 'utf8')
            const parsed = JSON.parse(raw) as PersistedState
            if (parsed.version === 1) {
                this.state = normalizeState(parsed)
                log.info('loaded state', {
                    operation: 'state.load',
                    statePath: this.filePath,
                    requests: this.state.requests.length,
                    pending: this.listPending().length,
                    responses: Object.keys(this.state.responses).length,
                })
                return
            }
            log.warn('unknown state version, resetting', {
                operation: 'state.load',
                statePath: this.filePath,
                version: (parsed as { version?: number }).version,
            })
        } catch (err) {
            const code = (err as NodeJS.ErrnoException).code
            if (code !== 'ENOENT') {
                log.error('load failed', {
                    operation: 'state.load',
                    statePath: this.filePath,
                    error: err,
                })
                throw err
            }
            log.info('no prior state file, starting fresh', {
                operation: 'state.load',
                statePath: this.filePath,
            })
        }
        this.state = { ...EMPTY_STATE, requests: [], responses: {} }
    }

    getRequest(id: string): InteractionRequest | undefined {
        return this.state.requests.find((r) => r.id === id)
    }

    listPending(): InteractionRequest[] {
        return this.state.requests.filter((r) => r.status === 'pending')
    }

    listRequests(): InteractionRequest[] {
        return this.state.requests.slice()
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
            req.status = res.reason === 'heartbeat-timeout' ? 'expired' : res.cancelled ? 'cancelled' : 'submitted'
            await this.upsertRequest(req)
            return
        }
        await this.flush()
    }

    getResponse(id: string): InteractionResponse | undefined {
        return this.state.responses[id]
    }

    listResponses(): Record<string, InteractionResponse> {
        return { ...this.state.responses }
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
            log.info('flushed state', {
                operation: 'state.save',
                statePath: this.filePath,
                bytes: snapshot.length,
                requests: this.state.requests.length,
                pending: this.listPending().length,
                responses: Object.keys(this.state.responses).length,
            })
        })
        await this.writeQueue
    }
}

function normalizeState(state: PersistedState): PersistedState {
    return {
        version: 1,
        requests: Array.isArray(state.requests)
            ? state.requests.map((req) => ({
                  ...req,
                  traceId: req.traceId ?? req.id,
              }))
            : [],
        responses: state.responses && typeof state.responses === 'object' ? state.responses : {},
    }
}
