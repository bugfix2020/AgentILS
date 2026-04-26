/**
 * HTTP bridge — used by webview (and optionally the VS Code extension)
 * to talk to the MCP orchestrator out-of-band from the LLM tool call.
 *
 * Endpoints:
 *   GET  /api/health
 *   GET  /api/state                     → canonical MCP StateSnapshot
 *   GET  /api/requests/pending          → list pending
 *   GET  /api/events                    → SSE: state.changed + request.* events + heartbeat ping
 *   POST /api/requests                  → create + park (used by ext bridge)
 *   POST /api/requests/:id/submit       → submit response
 *   POST /api/requests/:id/cancel
 *   POST /api/requests/:id/heartbeat
 */
import type { AddressInfo } from 'node:net'
import express, { type Application, type NextFunction, type Request, type Response } from 'express'
import type { Orchestrator, SseEvent } from '../orchestrator/orchestrator.js'
import { normalizeInteractionResponse } from '../interaction/response.js'
import { createLogger } from '../util/logger.js'

const log = createLogger('http')

export interface HttpServerHandle {
    app: Application
    port: number
    close: () => Promise<void>
}

const HEARTBEAT_INTERVAL_MS = 15_000

/**
 * Map an Orchestrator reject reason to an HTTP outcome that **preserves** the
 * original error message so AgentilsClient can re-throw the exact same `Error`
 * the extension's `vscode.lm.registerTool` invoke handler expects (`'cancelled'`
 * / `'heartbeat-timeout'`).
 *
 * Status codes:
 *   409 cancelled          — user-initiated cancellation
 *   408 heartbeat-timeout  — sweep aborted the parked promise
 *   500 (other)            — truly unexpected
 */
function classifyParkRejection(err: Error): { status: number; code: string } {
    if (err.message === 'cancelled') return { status: 409, code: 'cancelled' }
    if (err.message === 'heartbeat-timeout') return { status: 408, code: 'heartbeat-timeout' }
    return { status: 500, code: 'error' }
}

export async function startHttpBridge(orchestrator: Orchestrator, port: number): Promise<HttpServerHandle> {
    const app = express()

    app.use((req, _res, next) => {
        const startedAt = Date.now()
        log.info('http route begin', {
            operation: 'http.route',
            phase: 'begin',
            method: req.method,
            route: req.path,
        })
        _res.on('finish', () => {
            log.info('http route end', {
                operation: 'http.route',
                phase: 'end',
                method: req.method,
                route: req.path,
                status: _res.statusCode,
                durationMs: Date.now() - startedAt,
            })
        })
        next()
    })

    app.use(express.json({ limit: '10mb' }))

    app.get('/api/health', (_req, res) => {
        res.json({ ok: true, name: 'agentils-mcp', pending: orchestrator.pending().length })
    })

    app.get('/api/state', (_req, res) => {
        const snapshot = orchestrator.snapshot()
        log.info('state snapshot over HTTP', {
            operation: 'state.snapshot.http',
            version: snapshot.version,
            pending: snapshot.interactions.pending.length,
            submitted: snapshot.interactions.submitted.length,
            cancelled: snapshot.interactions.cancelled.length,
            expired: snapshot.interactions.expired.length,
        })
        res.json({ ok: true, snapshot })
    })

    app.get('/api/requests/pending', (_req, res) => {
        const requests = orchestrator.pending()
        log.info('pending replay over HTTP', {
            operation: 'request.pendingReplay',
            count: requests.length,
            requestIds: requests.map((req) => req.id),
        })
        res.json({ requests })
    })

    app.get('/api/events', (req: Request, res: Response) => {
        res.set({
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
        })
        res.flushHeaders?.()
        log.info('SSE client connected', {
            operation: 'sse.connect',
            route: '/api/events',
            remote: req.ip,
        })

        const send = (evt: SseEvent) => {
            res.write(`event: ${evt.type}\n`)
            res.write(`data: ${JSON.stringify(evt)}\n\n`)
        }

        // Replay the current snapshot so a freshly-attached host can recover.
        const currentSnapshot = orchestrator.snapshot()
        send({
            type: 'state.changed',
            reason: 'state.replayed',
            version: currentSnapshot.version,
            snapshot: currentSnapshot,
        })

        // Keep legacy request.created replay for older clients.
        const replay = orchestrator.pending()
        log.info('pending replay over SSE', {
            operation: 'request.pendingReplay',
            route: '/api/events',
            count: replay.length,
            requestIds: replay.map((req) => req.id),
        })
        for (const r of replay) {
            send({ type: 'request.created', request: r })
        }

        const unsubscribe = orchestrator.subscribe(send)
        const heartbeat = setInterval(() => {
            send({ type: 'heartbeat', now: Date.now() })
        }, HEARTBEAT_INTERVAL_MS)

        req.on('close', () => {
            clearInterval(heartbeat)
            unsubscribe()
            log.info('SSE client disconnected', {
                operation: 'sse.disconnect',
                route: '/api/events',
                remote: req.ip,
            })
        })
    })

    app.post(
        '/api/requests',
        asyncHandler(async (req, res) => {
            log.info('POST /api/requests (park)', {
                operation: 'request.park.http',
                toolName: req.body?.toolName,
            })
            try {
                const result = await orchestrator.park(req.body)
                res.json({ ok: true, response: result })
            } catch (err) {
                const e = err as Error
                const { status, code } = classifyParkRejection(e)
                log.warn('park rejected', { code, status, message: e.message })
                // Preserve original message under both `error` and `code` so older clients
                // (string match) and newer clients (code-based) can both work.
                res.status(status).json({ ok: false, code, error: e.message })
            }
        }),
    )

    app.post(
        '/api/requests/:id/submit',
        asyncHandler(async (req, res) => {
            const requestId = paramValue(req.params.id)
            const response = normalizeInteractionResponse(req.body)
            log.info('POST submit', {
                operation: 'request.submit.http',
                requestId,
                textLen: (response.text ?? '').length,
                imageCount: response.images?.length ?? 0,
                hasReportContent: typeof response.reportContent === 'string' && response.reportContent.length > 0,
            })
            await orchestrator.submit(requestId, response)
            res.json({ ok: true })
        }),
    )

    app.post(
        '/api/requests/:id/cancel',
        asyncHandler(async (req, res) => {
            const requestId = paramValue(req.params.id)
            log.info('POST cancel', {
                operation: 'request.cancel.http',
                requestId,
            })
            await orchestrator.cancel(requestId)
            res.json({ ok: true })
        }),
    )

    app.post(
        '/api/requests/:id/heartbeat',
        asyncHandler(async (req, res) => {
            const requestId = paramValue(req.params.id)
            log.info('POST heartbeat', {
                operation: 'request.heartbeat.http',
                requestId,
            })
            await orchestrator.heartbeat(requestId)
            res.json({ ok: true })
        }),
    )

    app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
        log.error('http route error', {
            operation: 'http.route',
            phase: 'error',
            method: req.method,
            route: req.path,
            error: err,
        })
        if (res.headersSent) return
        res.status(500).json({ ok: false, error: err.message })
    })

    return new Promise<HttpServerHandle>((resolve, reject) => {
        const server = app.listen(port, '127.0.0.1', () => {
            const addr = server.address()
            if (!addr || typeof addr === 'string') {
                reject(new Error(`http bridge listen returned unexpected address: ${String(addr)}`))
                return
            }
            const actualPort = (addr as AddressInfo).port
            log.info('http bridge listening', {
                operation: 'http.start',
                status: 'listening',
                httpPort: actualPort,
            })
            resolve({
                app,
                port: actualPort,
                close: () =>
                    new Promise((done) =>
                        server.close(() => {
                            log.info('http bridge closed', { port: actualPort })
                            done()
                        }),
                    ),
            })
        })
        server.once('error', (err) => {
            log.error('http bridge listen failed', {
                operation: 'http.start',
                httpPort: port,
                error: err,
            })
            reject(err)
        })
    })
}

function asyncHandler(
    handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
    return (req, res, next) => {
        void handler(req, res).catch(next)
    }
}

function paramValue(value: string | string[] | undefined): string {
    return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}
