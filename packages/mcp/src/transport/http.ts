/**
 * HTTP bridge — used by webview (and optionally the VS Code extension)
 * to talk to the MCP orchestrator out-of-band from the LLM tool call.
 *
 * Endpoints:
 *   GET  /api/health
 *   GET  /api/requests/pending          → list pending
 *   GET  /api/events                    → SSE: request.* events + heartbeat ping
 *   POST /api/requests                  → create + park (used by ext bridge)
 *   POST /api/requests/:id/submit       → submit response
 *   POST /api/requests/:id/cancel
 *   POST /api/requests/:id/heartbeat
 */
import type { AddressInfo } from 'node:net'
import express, { type Application, type Request, type Response } from 'express'
import type { Orchestrator, SseEvent } from '../orchestrator/orchestrator.js'

export interface HttpServerHandle {
  app: Application
  port: number
  close: () => Promise<void>
}

const HEARTBEAT_INTERVAL_MS = 15_000

export async function startHttpBridge(
  orchestrator: Orchestrator,
  port: number,
): Promise<HttpServerHandle> {
  const app = express()
  app.use(express.json({ limit: '10mb' }))

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, name: 'agentils-mcp' })
  })

  app.get('/api/requests/pending', (_req, res) => {
    res.json({ requests: orchestrator.pending() })
  })

  app.get('/api/events', (req: Request, res: Response) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    res.flushHeaders?.()

    const send = (evt: SseEvent) => {
      res.write(`event: ${evt.type}\n`)
      res.write(`data: ${JSON.stringify(evt)}\n\n`)
    }

    // Replay current pending so a freshly-attached webview can recover.
    for (const r of orchestrator.pending()) {
      send({ type: 'request.created', request: r })
    }

    const unsubscribe = orchestrator.subscribe(send)
    const heartbeat = setInterval(() => {
      send({ type: 'heartbeat', now: Date.now() })
    }, HEARTBEAT_INTERVAL_MS)

    req.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
    })
  })

  app.post('/api/requests', async (req, res) => {
    try {
      const result = await orchestrator.park(req.body)
      res.json({ ok: true, response: result })
    } catch (err) {
      res.status(500).json({ ok: false, error: (err as Error).message })
    }
  })

  app.post('/api/requests/:id/submit', async (req, res) => {
    await orchestrator.submit(req.params.id, {
      text: req.body?.text ?? '',
      images: req.body?.images,
      reportContent: req.body?.reportContent,
      timestamp: Date.now(),
    })
    res.json({ ok: true })
  })

  app.post('/api/requests/:id/cancel', async (req, res) => {
    await orchestrator.cancel(req.params.id)
    res.json({ ok: true })
  })

  app.post('/api/requests/:id/heartbeat', async (req, res) => {
    await orchestrator.heartbeat(req.params.id)
    res.json({ ok: true })
  })

  return new Promise<HttpServerHandle>((resolve) => {
    const server = app.listen(port, '127.0.0.1', () => {
      const actualPort = (server.address() as AddressInfo).port
      resolve({
        app,
        port: actualPort,
        close: () => new Promise((done) => server.close(() => done())),
      })
    })
  })
}
