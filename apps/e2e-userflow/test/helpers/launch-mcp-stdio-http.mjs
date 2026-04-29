/**
 * Combined launcher: stdio MCP + HTTP bridge sharing one Orchestrator.
 * Used by 04-lm-toolcall.test.ts to exercise the real LLM path.
 *
 * Stdout is reserved for MCP JSON-RPC; we report the chosen HTTP port to
 * stderr in the form `http=http://127.0.0.1:<port>`.
 */
import { JsonStore, Orchestrator } from '@agentils/mcp'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import express from 'express'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'

const store = new JsonStore(join(tmpdir(), `agentils-lm-${process.pid}.json`))
await store.load()
const orchestrator = new Orchestrator(store, 5 * 60_000)

// --- HTTP bridge (mirror of packages/mcp/src/transport/http.ts) ---
const app = express()
app.use(express.json({ limit: '10mb' }))
app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.get('/api/requests/pending', (_req, res) => res.json({ requests: orchestrator.pending() }))
app.post('/api/requests/:id/submit', async (req, res) => {
    await orchestrator.submit(req.params.id, {
        text: req.body?.text ?? '',
        timestamp: Date.now(),
    })
    res.json({ ok: true })
})
app.post('/api/requests/:id/cancel', async (req, res) => {
    await orchestrator.cancel(req.params.id)
    res.json({ ok: true })
})

const httpServer = app.listen(0, '127.0.0.1', () => {
    const port = httpServer.address().port
    process.stderr.write(`http=http://127.0.0.1:${port}\n`)
})

// --- stdio MCP (mirror of packages/mcp/src/transport/stdio.ts) ---
const baseInput = {
    question: z.string().min(1),
    context: z.string().optional(),
    placeholder: z.string().optional(),
}
const server = new McpServer({ name: 'agentils-mcp', version: '0.1.0' })
const register = (toolName, description) => {
    server.registerTool(toolName, { description, inputSchema: baseInput }, async (args) => {
        const response = await orchestrator.park({ toolName, ...args })
        return { content: [{ type: 'text', text: response.text }] }
    })
}
register('request_user_clarification', 'Ask the user a clarifying question.')
register('request_contact_user', 'Proactively contact the user.')
register('request_user_feedback', 'Collect feedback from the user after a task.')
server.registerTool(
    'request_dynamic_action',
    {
        description: 'Generic action dispatch (action + params).',
        inputSchema: { action: z.string().min(1), params: z.record(z.unknown()).optional() },
    },
    async (args) => {
        const params = args.params ?? {}
        const question = params.question ?? `dynamic:${args.action}`
        const response = await orchestrator.park({
            toolName: 'request_dynamic_action',
            question,
            action: args.action,
            params,
        })
        return { content: [{ type: 'text', text: response.text }] }
    },
)
await server.connect(new StdioServerTransport())
process.stderr.write('mcp ready\n')
