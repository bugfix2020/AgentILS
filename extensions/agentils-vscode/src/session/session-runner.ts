import * as vscode from 'vscode'
import type { ConversationSessionManager } from './conversation-session-manager'
import {
  buildToolLogContent,
  compileAgentILSSessionMessages,
  createAgentILSParticipantTools,
  executeAgentILSPrivateTool,
  getQueuedUserMessageIds,
  waitForPanelInputOrFinish,
} from '../chat-participant-followup'
import { log } from '../logger'

/**
 * Standalone LLM loop that drives AgentILS sessions independently of the
 * Chat Participant context. Uses `vscode.lm.selectChatModels()` for model
 * access so it works when the user enters through the WebView directly.
 */
export class SessionRunner implements vscode.Disposable {
  private activeCts: vscode.CancellationTokenSource | null = null

  constructor(private readonly sessionManager: ConversationSessionManager) {}

  /**
   * Start or restart the LLM loop for the current session.
   * Called after `submitSessionMessage` appends a user message.
   * Cancels any previously running loop.
   */
  async continueSession(sessionId?: string): Promise<void> {
    // Cancel any previous run
    this.cancelActiveRun()

    const cts = new vscode.CancellationTokenSource()
    this.activeCts = cts

    try {
      await this.runLoop(cts.token, sessionId)
    } catch (error) {
      if (error instanceof vscode.CancellationError) {
        log('session-runner', 'loop cancelled')
        return
      }
      log('session-runner', 'loop error', {
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      if (this.activeCts === cts) {
        this.activeCts = null
      }
      cts.dispose()
    }
  }

  /**
   * Resume the LLM loop after a pending interaction (clarification,
   * approval, feedback) resolves. Delegates to `continueSession`.
   */
  async resumeAfterInteraction(sessionId?: string): Promise<void> {
    return this.continueSession(sessionId)
  }

  /**
   * Cancel the currently active LLM loop, if any.
   */
  cancelActiveRun(): void {
    if (this.activeCts) {
      this.activeCts.cancel()
      this.activeCts.dispose()
      this.activeCts = null
    }
  }

  dispose(): void {
    this.cancelActiveRun()
  }

  // ── private ──────────────────────────────────────────────────────────

  private async runLoop(
    token: vscode.CancellationToken,
    trackedSessionId?: string,
  ): Promise<void> {
    const model = await this.selectModel()
    if (!model) {
      log('session-runner', 'no language model available')
      await this.sessionManager.appendToolEvent(
        'status',
        'No language model available. Please ensure Copilot is active.',
      )
      return
    }

    const tools = createAgentILSParticipantTools()

    while (!token.isCancellationRequested) {
      let state = this.sessionManager.snapshot()
      let session = state.snapshot.session

      if (!session) {
        await this.sessionManager.refresh()
        state = this.sessionManager.snapshot()
        session = state.snapshot.session
      }

      if (!session) {
        log('session-runner', 'session unavailable, stopping')
        return
      }

      if (session.status === 'finished') {
        log('session-runner', 'session finished')
        return
      }

      // Wait until the session has queued user messages or finishes
      if (getQueuedUserMessageIds(session).length === 0) {
        await waitForPanelInputOrFinish(this.sessionManager, token, session.sessionId)
        continue
      }

      const queuedMessageIds = [...getQueuedUserMessageIds(session)]
      const messages = compileAgentILSSessionMessages(state)

      // Inner tool-call loop: keeps going until the model stops calling tools
      while (!token.isCancellationRequested) {
        log('session-runner', 'sendRequest', {
          sessionId: session.sessionId,
          queuedMessageCount: queuedMessageIds.length,
          messageCount: messages.length,
        })

        const modelResponse = await model.sendRequest(
          messages,
          {
            justification: 'Continue the AgentILS WebView-owned session.',
            tools,
            toolMode: vscode.LanguageModelChatToolMode.Auto,
          },
          token,
        )

        const assistantParts: Array<vscode.LanguageModelTextPart | vscode.LanguageModelToolCallPart> = []
        const toolCalls: vscode.LanguageModelToolCallPart[] = []
        let assistantMessageId: string | undefined
        let accumulatedText = ''
        let lastFlushTime = 0
        const FLUSH_INTERVAL = 200

        for await (const part of modelResponse.stream) {
          if (part instanceof vscode.LanguageModelTextPart) {
            assistantParts.push(part)
            accumulatedText += part.value

            const now = Date.now()
            if (now - lastFlushTime >= FLUSH_INTERVAL) {
              lastFlushTime = now
              const result = await this.sessionManager.appendAssistantMessage(
                accumulatedText,
                'streaming',
                session.runId ?? undefined,
                session.sessionId,
                assistantMessageId,
              )
              if (!assistantMessageId) {
                const lastMsg = result.session.messages.at(-1)
                if (lastMsg && lastMsg.role === 'assistant') {
                  assistantMessageId = lastMsg.id
                }
              }
            }
            continue
          }

          if (part instanceof vscode.LanguageModelToolCallPart) {
            assistantParts.push(part)
            toolCalls.push(part)
            await this.sessionManager.appendToolEvent(
              'tool_call',
              buildToolLogContent(part.name, part.input),
              'final',
              session.runId ?? undefined,
              session.sessionId,
            )
          }
        }

        // Final flush with state 'final'
        if (accumulatedText) {
          await this.sessionManager.appendAssistantMessage(
            accumulatedText,
            'final',
            session.runId ?? undefined,
            session.sessionId,
            assistantMessageId,
          )
        }

        // Mark queued user messages as consumed
        for (const messageId of queuedMessageIds) {
          await this.sessionManager.consumeSessionUserMessage(
            messageId,
            session.runId ?? undefined,
            session.sessionId,
          )
        }

        if (assistantParts.length > 0) {
          messages.push(vscode.LanguageModelChatMessage.Assistant(assistantParts))
        }

        // No tool calls → turn complete, wait for next user input
        if (toolCalls.length === 0) {
          break
        }

        // Execute tool calls and append results for the next model turn
        for (const toolCall of toolCalls) {
          const toolResult = await executeAgentILSPrivateTool(
            this.sessionManager,
            toolCall,
            this.sessionManager.snapshot(),
          )
          await this.sessionManager.appendToolEvent(
            'tool_result',
            `${toolCall.name}\n${toolResult.text}`,
            'final',
            session.runId ?? undefined,
            session.sessionId,
          )
          messages.push(
            vscode.LanguageModelChatMessage.User([
              new vscode.LanguageModelToolResultPart(toolCall.callId, [
                new vscode.LanguageModelTextPart(toolResult.text),
              ]),
            ]),
          )
        }

        // Refresh session state for next iteration
        state = this.sessionManager.snapshot()
        session = state.snapshot.session
        if (!session || session.status === 'finished') {
          log('session-runner', 'session finished after tool execution')
          return
        }
      }
    }
  }

  private async selectModel(): Promise<vscode.LanguageModelChat | null> {
    try {
      const models = await vscode.lm.selectChatModels({ vendor: 'copilot' })
      if (models.length === 0) {
        return null
      }
      // Prefer gpt-4o family, fall back to first available
      return models.find((m) => m.family.includes('gpt-4o')) ?? models[0]
    } catch (error) {
      log('session-runner', 'model selection failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }
}
