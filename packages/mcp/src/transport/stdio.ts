/**
 * stdio MCP transport — exposes the AgentILS tools to non-VS Code IDEs
 * (Claude Desktop, Cursor, etc.) following the standard MCP spec.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import type { Orchestrator } from '../orchestrator/orchestrator.js'
import { cancelledInteractionResponse, textForLlm, timeoutInteractionResponse } from '../interaction/response.js'
import type { ToolName } from '../types/index.js'
import { createLogger } from '../util/logger.js'

const log = createLogger('stdio')

const baseInput = {
    question: z.string().min(1),
    context: z.string().optional(),
    placeholder: z.string().optional(),
}

export function buildMcpServer(orchestrator: Orchestrator): McpServer {
    const server = new McpServer({
        name: 'agentils-mcp',
        version: '0.1.0',
    })

    const register = (toolName: ToolName, description: string) => {
        server.registerTool(
            toolName,
            {
                description,
                inputSchema: baseInput,
            },
            async (args) => {
                log.info('tools/call invoked', { toolName, qLen: args.question.length })
                try {
                    const response = await orchestrator.park({
                        toolName,
                        question: args.question,
                        context: args.context,
                        placeholder: args.placeholder,
                    })
                    log.info('tools/call resolved', {
                        operation: 'tool.call',
                        toolName,
                        status: response.cancelled ? 'cancelled' : 'submitted',
                        textLen: (response.text ?? '').length,
                        imageCount: response.images?.length ?? 0,
                    })
                    return {
                        content: [{ type: 'text', text: textForLlm(response) }],
                    }
                } catch (err) {
                    const message = (err as Error).message
                    log.warn('tools/call rejected', {
                        operation: 'tool.call',
                        toolName,
                        error: message,
                    })
                    if (message === 'cancelled') {
                        return { content: [{ type: 'text', text: textForLlm(cancelledInteractionResponse()) }] }
                    }
                    if (message === 'heartbeat-timeout') {
                        return { content: [{ type: 'text', text: textForLlm(timeoutInteractionResponse()) }] }
                    }
                    throw err
                }
            },
        )
        log.debug('tool registered', { toolName })
    }

    register('request_user_clarification', 'Ask the user a clarifying question.')
    register('request_contact_user', 'Proactively contact the user.')
    register('request_user_feedback', 'Collect feedback from the user after a task.')

    server.registerTool(
        'request_dynamic_action',
        {
            description: 'Generic action dispatch (action + params).',
            inputSchema: {
                action: z.string().min(1),
                params: z.record(z.unknown()),
            },
        },
        async (args) => {
            log.info('tools/call invoked', { toolName: 'request_dynamic_action', action: args.action })
            const params = args.params ?? {}
            const question = (params.question as string | undefined) ?? `dynamic:${args.action}`
            try {
                const response = await orchestrator.park({
                    toolName: 'request_dynamic_action',
                    question,
                    action: args.action,
                    params,
                })
                log.info('tools/call resolved', {
                    operation: 'tool.call',
                    toolName: 'request_dynamic_action',
                    action: args.action,
                    status: response.cancelled ? 'cancelled' : 'submitted',
                    textLen: (response.text ?? '').length,
                    imageCount: response.images?.length ?? 0,
                })
                return {
                    content: [{ type: 'text', text: textForLlm(response) }],
                }
            } catch (err) {
                const message = (err as Error).message
                log.warn('tools/call rejected', {
                    operation: 'tool.call',
                    toolName: 'request_dynamic_action',
                    action: args.action,
                    error: message,
                })
                if (message === 'cancelled') {
                    return { content: [{ type: 'text', text: textForLlm(cancelledInteractionResponse()) }] }
                }
                if (message === 'heartbeat-timeout') {
                    return { content: [{ type: 'text', text: textForLlm(timeoutInteractionResponse()) }] }
                }
                throw err
            }
        },
    )
    log.debug('tool registered', { toolName: 'request_dynamic_action' })

    return server
}

export async function startStdioTransport(orchestrator: Orchestrator): Promise<void> {
    const server = buildMcpServer(orchestrator)
    const transport = new StdioServerTransport()
    await server.connect(transport)
    log.info('stdio transport connected')
}
