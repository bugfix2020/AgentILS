import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  ResourceUpdatedNotificationSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { randomUUID } from 'node:crypto'
import { createServer as createHttpServer } from 'node:http'
import { AddressInfo } from 'node:net'

/**
 * Phase 4 feasibility probe:
 *   Verify that streamable HTTP transport supports the full
 *   resource subscription roundtrip end-to-end:
 *     server.registerResource(...) +
 *     server.server.setRequestHandler(SubscribeRequestSchema, ...) +
 *     client.subscribeResource({uri}) +
 *     server.server.sendResourceUpdated({uri}) ->
 *     client.setNotificationHandler(ResourceUpdatedNotificationSchema, ...)
 *
 * This proves Webview-side state can be pushed in real time without
 * polling. If this passes, Phase 4 implementation can follow the same
 * pattern in real gateway code.
 */

async function startMinimalServer() {
  const server = new McpServer(
    { name: 'phase4-probe', version: '0.0.0' },
    {
      capabilities: {
        resources: { subscribe: true, listChanged: true },
      },
    },
  )

  let counter = 0
  server.registerResource(
    'probe-counter',
    'state://probe/counter',
    { title: 'Counter', mimeType: 'application/json' },
    async () => ({
      contents: [
        { uri: 'state://probe/counter', text: JSON.stringify({ counter }) },
      ],
    }),
  )

  // Track subscribers ourselves; McpServer does not auto-register
  // resources/subscribe — confirmed via SDK source inspection.
  const subscribers = new Set<string>()
  server.server.setRequestHandler(SubscribeRequestSchema, async (request) => {
    subscribers.add(request.params.uri)
    return {}
  })
  server.server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
    subscribers.delete(request.params.uri)
    return {}
  })

  const transports = new Map<string, StreamableHTTPServerTransport>()
  const httpServer = createHttpServer(async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    let transport = sessionId ? transports.get(sessionId) : undefined
    if (!transport) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports.set(id, transport!)
        },
      })
      await server.connect(transport)
    }
    let body: unknown
    if (req.method === 'POST') {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(chunk as Buffer)
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        body = undefined
      }
    }
    await transport.handleRequest(req, res, body)
  })

  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  const port = (httpServer.address() as AddressInfo).port

  return {
    url: `http://127.0.0.1:${port}/`,
    bumpCounter: async () => {
      counter += 1
      // Push notification to all subscribers of this URI.
      if (subscribers.has('state://probe/counter')) {
        await server.server.sendResourceUpdated({ uri: 'state://probe/counter' })
      }
    },
    close: async () => {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()))
    },
  }
}

test('Phase 4: HTTP resource subscription pushes server-initiated notifications', async () => {
  const srv = await startMinimalServer()
  try {
    const updates: string[] = []
    const client = new Client(
      { name: 'phase4-probe-client', version: '0.0.0' },
      { capabilities: {} },
    )
    client.setNotificationHandler(
      ResourceUpdatedNotificationSchema,
      async (note) => {
        updates.push(note.params.uri)
      },
    )

    const transport = new StreamableHTTPClientTransport(new URL(srv.url))
    await client.connect(transport)

    // Subscribe BEFORE bumping so we definitely receive the push.
    await client.subscribeResource({ uri: 'state://probe/counter' })

    await srv.bumpCounter()
    await srv.bumpCounter()

    // Allow event loop to deliver SSE notifications.
    await new Promise((resolve) => setTimeout(resolve, 150))

    assert.deepEqual(
      updates,
      ['state://probe/counter', 'state://probe/counter'],
      'expected two server-pushed resource updates over HTTP',
    )

    // Verify the actual updated content is fetchable via the same URI.
    const read = await client.readResource({ uri: 'state://probe/counter' })
    const text = read.contents[0]?.text
    assert.equal(typeof text, 'string')
    assert.match(String(text), /"counter":\s*2/)

    await client.close()
    await transport.close()
  } finally {
    await srv.close()
  }
})
