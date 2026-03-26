// src/tools/interactive-feedback.ts

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { MemoryStore } from '../store/memory-store.js'
import { runInteractionLoop } from '../interaction/interaction-loop.js'

const log = (...args: unknown[]) => console.error('[interactive_feedback]', ...args)

/** 注册 interactive_feedback 工具到 MCP Server */
export function registerInteractiveFeedback(mcpServer: McpServer, store: MemoryStore): void {
  mcpServer.registerTool(
    'interactive_feedback',
    {
      description:
        'Start a multi-round interactive feedback loop with the user. ' +
        'This tool blocks until the user finishes providing feedback. ' +
        'Uses MCP elicitInput and optionally createMessage (sampling) for AI-assisted dialogue.',
      inputSchema: {
        title: z.string().describe('Short title or summary of current task status'),
        question: z.string().describe('The question to ask the user'),
        answer: z.string().optional().describe('Optional assistant answer shown before the feedback question'),
        runId: z.string().optional().describe('Optional run ID to mark feedback as collected'),
        channel: z.enum(['auto', 'mcp', 'hc']).optional().describe('Interaction channel: auto (default), mcp (elicitInput only), hc (HC extension webview)'),
      },
    },
    async (params) => {
      log('CALLED with params:', JSON.stringify(params))

      const result = await runInteractionLoop({
        mcpServer,
        title: params.title,
        question: params.question,
        answer: params.answer,
        channel: params.channel as 'auto' | 'mcp' | 'hc' | undefined,
      })

      log('loop finished:', JSON.stringify(result))

      // 标记 run 已收集反馈
      if (params.runId) {
        const run = store.getRun(params.runId)
        if (run) {
          run.feedbackCollected = true
          run.feedbackRounds = result.feedbackRounds
          run.samplingUsed = result.samplingUsed
          run.interactionMode = result.channel === 'hc_webview' ? 'hc' : 'mcp'
          store.setRun(run)
          log('MARKED run feedback for runId:', params.runId)
        }
      }

      return {
        content: [{ type: 'text' as const, text: '[[FEEDBACK_DONE]]' }],
      }
    },
  )
}
