import { z } from 'zod'
import type { AgentGateServerRuntime } from './context.js'

export function registerGatewayPrompts(runtime: AgentGateServerRuntime): void {
  const { server } = runtime

  server.registerPrompt(
    'run_task',
    {
      description: 'Single AgentILS V1 entry prompt. Read state first, then drive run_task_loop.',
      argsSchema: {
        request: z.string().describe('The current user request'),
      },
    },
    async ({ request }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Read state_get first. Then call run_task_loop with the user intent: ${request}. Continue following the tool response instead of switching to other AgentILS prompts.`,
          },
        },
      ],
    }),
  )
}
