import { z } from 'zod'
import { mcpLogger } from '../logger.js'
import type { AgentGateServerRuntime } from './context.js'
import { textResult } from './shared.js'
import { RunTaskLoopInputSchema, TaskInteractionResultSchema } from '../types/task.js'

// MCP clients (incl. VS Code Copilot) typically time out tool calls after
// ~60s of silence. We send a progress notification every PROGRESS_INTERVAL_MS
// while parked on awaitInteraction so the request stays alive. AWAIT_TIMEOUT_MS
// is a hard ceiling — beyond this we give up and return await_webview as-is so
// the LLM can decide (it shouldn't matter because the webview is the only
// surface that can resolve, but we don't want to leak parked promises).
const PROGRESS_INTERVAL_MS = 25_000
const AWAIT_TIMEOUT_MS = 10 * 60 * 1000

export function registerGatewayTools(runtime: AgentGateServerRuntime) {
  const { server, orchestrator } = runtime

  server.registerTool(
    'state_get',
    {
      description: 'Read the current AgentILS V1 session/task snapshot.',
      inputSchema: {
        taskId: z.string().optional(),
      },
    },
    async ({ taskId }) => {
      mcpLogger.info('gateway/tools', 'state_get:start', { taskId })
      const snapshot = orchestrator.stateGet(taskId)
      mcpLogger.info('gateway/tools', 'state_get:done', {
        taskId: snapshot.task?.taskId ?? null,
        phase: snapshot.task?.phase ?? null,
        terminal: snapshot.task?.terminal ?? null,
      })
      return textResult('State snapshot', snapshot)
    },
  )

  server.registerTool(
    'request_user_clarification',
    {
      description: 'Request clarification from the user via MCP elicitation and return the response.',
      inputSchema: {
        question: z.string(),
        context: z.string().optional(),
        placeholder: z.string().optional(),
        required: z.boolean().optional(),
      },
    },
    async ({ question, context, placeholder, required }, _ctx) => {
      mcpLogger.info('gateway/tools', 'request_user_clarification:start', {
        question,
        hasContext: Boolean(context),
        required: required ?? true,
      })
      // Use the underlying low-level Server's elicitInput. McpServer exposes
      // it via the public `.server` property. ctx.sendRequest would also work
      // but calling on the server is the canonical pattern documented in the
      // SDK and matches how the rest of the gateway issues elicitations.
      const result = await server.server.elicitInput({
        mode: 'form',
        message: context ? `${question}\n\nContext:\n${context}` : question,
        requestedSchema: {
          type: 'object',
          properties: {
            answer: {
              type: 'string',
              title: question,
              description: placeholder ?? 'Please provide clarification.',
            },
          },
          required: required === false ? [] : ['answer'],
        },
      })
      mcpLogger.info('gateway/tools', 'request_user_clarification:done', {
        action: result.action,
      })
      return textResult('Request user clarification', {
        action: result.action,
        content: result.action === 'accept' ? result.content : undefined,
      })
    },
  )

  server.registerTool(
    'run_task_loop',
    {
      description: 'Advance the AgentILS V1 task loop and return the next interaction/render instructions.',
      inputSchema: RunTaskLoopInputSchema,
    },
    async (input, ctx) => {
      mcpLogger.info('gateway/tools', 'run_task_loop:start', input)
      let result = orchestrator.runTaskLoop(input)
      mcpLogger.info('gateway/tools', 'run_task_loop:initial', {
        status: result.status,
        taskId: result.task.taskId,
        phase: result.task.phase,
        terminal: result.task.terminal,
        nextAction: result.next.action,
      })

      // Phase 5 control inversion: if the orchestrator decided to wait for
      // webview/elicitation, park the tool here. The LLM cannot decide to
      // emit chat text in the meantime — it sees a still-running tool call.
      // Resolution comes from submit_interaction_result (HTTP from extension).
      if (result.next.action === 'await_webview') {
        const taskId = result.task.taskId
        const signal: AbortSignal | undefined = ctx?.signal
        const sendNotification = ctx?.sendNotification
        const progressToken = ctx?._meta?.progressToken
        let progressCount = 0

        const heartbeat = setInterval(() => {
          progressCount += 1
          if (progressToken !== undefined && sendNotification) {
            sendNotification({
              method: 'notifications/progress',
              params: {
                progressToken,
                progress: progressCount,
                message: `awaiting webview interaction (${progressCount * PROGRESS_INTERVAL_MS / 1000}s)`,
              },
            }).catch(() => { /* notification failures must not break the wait */ })
          }
        }, PROGRESS_INTERVAL_MS)

        try {
          mcpLogger.info('gateway/tools', 'run_task_loop:await-park', { taskId })
          const interactionResult = await Promise.race([
            orchestrator.awaitInteraction(taskId, signal),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('await_webview_timeout')), AWAIT_TIMEOUT_MS).unref?.(),
            ),
          ])
          mcpLogger.info('gateway/tools', 'run_task_loop:await-resolved', {
            taskId,
            actionId: interactionResult.actionId,
            interactionKey: interactionResult.interactionKey,
          })
          // Re-enter runTaskLoop with the user's resolution applied.
          result = orchestrator.runTaskLoop({
            ...input,
            taskId,
            interactionResult,
          })
        } catch (err) {
          mcpLogger.info('gateway/tools', 'run_task_loop:await-aborted', {
            taskId,
            reason: (err as Error).message,
          })
          // Fall through with the original await_webview result; the client
          // will see it and can choose to recall.
        } finally {
          clearInterval(heartbeat)
        }
      }

      mcpLogger.info('gateway/tools', 'run_task_loop:done', {
        status: result.status,
        taskId: result.task.taskId,
        phase: result.task.phase,
        terminal: result.task.terminal,
        hasInteraction: Boolean(result.interaction),
        shouldRecallTool: result.next.shouldRecallTool,
        canRenderWebview: result.next.canRenderWebview,
        nextAction: result.next.action,
      })
      return textResult('Run task loop', result)
    },
  )

  server.registerTool(
    'submit_interaction_result',
    {
      description:
        'Resolve a parked run_task_loop call. Called by the AgentILS Webview (via the VS Code extension) when the user clicks an action button or submits free-form input.',
      inputSchema: {
        taskId: z.string(),
        result: TaskInteractionResultSchema,
      },
    },
    async ({ taskId, result }) => {
      mcpLogger.info('gateway/tools', 'submit_interaction_result:start', {
        taskId,
        interactionKey: result.interactionKey,
        actionId: result.actionId,
      })
      const fulfilled = orchestrator.resolveInteraction(taskId, result)

      // P1 fix: 如果 LLM 已 abort（无 waiter），由 submit_interaction_result
      // 自己调 runTaskLoop 推进状态机，避免 user 的 webview 操作被静默丢弃。
      // 正常路径（fulfilled=true）由 LLM 那边 parked 的 run_task_loop 在
      // resolveInteraction 触发后自然 recall 推进；不在此处重复执行以避免双跑。
      let advanced: ReturnType<typeof orchestrator.runTaskLoop> | undefined
      if (!fulfilled) {
        mcpLogger.info('gateway/tools', 'submit_interaction_result:fallback-advance', {
          taskId,
          interactionKey: result.interactionKey,
        })
        advanced = orchestrator.runTaskLoop({ taskId, interactionResult: result })
      }

      mcpLogger.info('gateway/tools', 'submit_interaction_result:done', {
        taskId,
        fulfilled,
        advancedPhase: advanced?.task.phase,
        advancedTerminal: advanced?.task.terminal,
      })
      return textResult('Submit interaction result', {
        taskId,
        fulfilled,
        // 当 fallback 路径生效时回传新状态，方便 extension 决定是否立即刷新 UI
        advanced: advanced ?? null,
      })
    },
  )
}
