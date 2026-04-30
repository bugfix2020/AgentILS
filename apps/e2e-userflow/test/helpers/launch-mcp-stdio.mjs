/**
 * stdio MCP launcher (used by 03-stdio-mcp.test.ts) — bypasses the broken
 * Windows `isCli` detection in packages/mcp/src/index.ts.
 *
 * `buildMcpServer` is internal to the mcp package; we recreate it here using
 * the same shape as src/transport/stdio.ts.
 */
import { JsonStore, Orchestrator } from '@agent-ils/mcp'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'

const store = new JsonStore(join(tmpdir(), `agentils-stdio-${process.pid}.json`))
await store.load()
const orchestrator = new Orchestrator(store, 5 * 60_000)

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
process.stderr.write('stdio mcp ready\n')

// silence the `homedir` unused-import warning
void homedir
