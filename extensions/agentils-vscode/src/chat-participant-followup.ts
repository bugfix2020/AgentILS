import * as vscode from 'vscode'
import type {
  AgentILSApprovalRequestInput,
  AgentILSPanelState,
  AgentILSSessionMessage,
  AgentILSSessionState,
  ContinueTaskInput,
} from './model'
import { log } from './logger'
import type { ConversationSessionManager } from './session/conversation-session-manager'

const agentilsPrivateToolNames = {
  continueTask: 'agentils_continue_task',
  requestClarification: 'agentils_request_clarification',
  requestFeedback: 'agentils_request_feedback',
  requestApproval: 'agentils_request_approval',
} as const

function compactWhitespace(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function matchesTrackedSession(session: AgentILSSessionState | null | undefined, sessionId?: string | null) {
  if (!sessionId) {
    return Boolean(session)
  }
  return session?.sessionId === sessionId
}

export function waitForPanelInputOrFinish(
  sessionManager: ConversationSessionManager,
  token: vscode.CancellationToken,
  trackedSessionId?: string | null,
): Promise<void> {
  const currentSession = sessionManager.snapshot().snapshot.session
  if (
    matchesTrackedSession(currentSession, trackedSessionId) &&
    (currentSession?.status === 'finished' || getQueuedUserMessageIds(currentSession).length > 0)
  ) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve, reject) => {
    const disposables: vscode.Disposable[] = []
    const finish = () => {
      while (disposables.length > 0) {
        disposables.pop()?.dispose()
      }
      resolve()
    }

    disposables.push(
      sessionManager.onDidChange(() => {
        const nextSession = sessionManager.snapshot().snapshot.session
        if (
          matchesTrackedSession(nextSession, trackedSessionId) &&
          (nextSession?.status === 'finished' || getQueuedUserMessageIds(nextSession).length > 0)
        ) {
          finish()
        }
      }),
      token.onCancellationRequested(() => {
        while (disposables.length > 0) {
          disposables.pop()?.dispose()
        }
        reject(new vscode.CancellationError())
      }),
    )
  })
}

export function getQueuedUserMessageIds(session: AgentILSSessionState | null | undefined) {
  return Array.isArray(session?.queuedUserMessageIds) ? session.queuedUserMessageIds : []
}

function getSessionMessages(session: AgentILSSessionState | null | undefined) {
  return Array.isArray(session?.messages) ? session.messages : []
}

function buildSystemInstructionBlock(state: AgentILSPanelState, originalPrompt?: string) {
  const task = state.snapshot.activeTask
  const lines = [
    'You are AgentILS running inside a VS Code WebView-first workflow.',
    'The AgentILS WebView is the primary interface for both user input and assistant output.',
    'Do not ask the user to switch back to Copilot chat for normal interaction.',
    'Do not finish the session unless the user explicitly uses the WebView finish action.',
    originalPrompt?.trim() ? `Initial Copilot request:\n${originalPrompt.trim()}` : '',
    task
      ? `Current task:\n- title: ${task.title}\n- goal: ${task.goal}\n- controlMode: ${task.controlMode}\n- phase: ${task.phase}\n- status: ${task.status}`
      : 'No active task snapshot is currently available.',
  ]

  return lines.filter(Boolean).join('\n\n')
}

function foldSessionEventIntoSystemHistory(message: AgentILSSessionMessage): string {
  const label = `${message.role}:${message.kind}`
  return `[${label}] ${message.content}`
}

function mergeContiguousDialogMessages(messages: AgentILSSessionMessage[]) {
  const merged: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const message of messages) {
    if (message.kind !== 'text') {
      continue
    }
    if (message.role !== 'user' && message.role !== 'assistant') {
      continue
    }
    const normalized = compactWhitespace(message.content)
    if (!normalized) {
      continue
    }
    const last = merged.at(-1)
    if (last && last.role === message.role) {
      last.content = `${last.content}\n${normalized}`
      continue
    }
    merged.push({
      role: message.role,
      content: normalized,
    })
  }
  return merged
}

export function compileAgentILSSessionMessages(
  state: AgentILSPanelState,
  originalPrompt?: string,
): vscode.LanguageModelChatMessage[] {
  const session = state.snapshot.session
  const systemHistory = getSessionMessages(session)
    .filter((message) => message.kind !== 'text' || (message.role !== 'user' && message.role !== 'assistant'))
    .map(foldSessionEventIntoSystemHistory)
    .join('\n')

  const messages: vscode.LanguageModelChatMessage[] = [
    vscode.LanguageModelChatMessage.User(
      [buildSystemInstructionBlock(state, originalPrompt), systemHistory ? `Session event history:\n${systemHistory}` : '']
        .filter(Boolean)
        .join('\n\n'),
    ),
  ]

  for (const message of mergeContiguousDialogMessages(getSessionMessages(session))) {
    messages.push(
      message.role === 'user'
        ? vscode.LanguageModelChatMessage.User(message.content)
        : vscode.LanguageModelChatMessage.Assistant(message.content),
    )
  }

  return messages
}

export function createAgentILSParticipantTools(): vscode.LanguageModelChatTool[] {
  return [
    {
      name: agentilsPrivateToolNames.continueTask,
      description: 'Advance the current AgentILS task after updating plan or execution intent.',
      inputSchema: {
        type: 'object',
        properties: {
          note: { type: 'string', description: 'Optional continuation note for the next task step.' },
        },
      },
    },
    {
      name: agentilsPrivateToolNames.requestClarification,
      description: 'Ask the user for missing information by opening an AgentILS clarification interaction in the WebView.',
      inputSchema: {
        type: 'object',
        required: ['question'],
        properties: {
          question: { type: 'string' },
          context: { type: 'string' },
          placeholder: { type: 'string' },
          required: { type: 'boolean' },
        },
      },
    },
    {
      name: agentilsPrivateToolNames.requestFeedback,
      description: 'Ask the user for continue/done/revise feedback in the AgentILS WebView.',
      inputSchema: {
        type: 'object',
        required: ['question', 'summary'],
        properties: {
          question: { type: 'string' },
          summary: { type: 'string' },
          allowedActions: {
            type: 'array',
            items: { type: 'string', enum: ['continue', 'done', 'revise'] },
          },
        },
      },
    },
    {
      name: agentilsPrivateToolNames.requestApproval,
      description: 'Request user approval in the AgentILS WebView before continuing a risky action.',
      inputSchema: {
        type: 'object',
        required: ['summary', 'riskLevel'],
        properties: {
          summary: { type: 'string' },
          riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
          targets: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
  ]
}

export function buildToolLogContent(toolName: string, input: object) {
  return `${toolName}\n${JSON.stringify(input, null, 2)}`
}

export async function executeAgentILSPrivateTool(
  sessionManager: ConversationSessionManager,
  toolCall: vscode.LanguageModelToolCallPart,
  state: AgentILSPanelState,
) {
  const activeTask = state.snapshot.activeTask
  const preferredRunId = activeTask?.runId
  const preferredSessionId = state.snapshot.session?.sessionId

  if (toolCall.name === agentilsPrivateToolNames.continueTask) {
    const input = toolCall.input as ContinueTaskInput
    await sessionManager.continueTask({
      preferredRunId,
      note: typeof input.note === 'string' ? input.note : undefined,
    })
    return {
      text: 'AgentILS continued the active task.',
    }
  }

  if (toolCall.name === agentilsPrivateToolNames.requestClarification) {
    const input = toolCall.input as Record<string, unknown>
    await sessionManager.requestClarificationThroughRuntime({
      preferredRunId,
      question: typeof input.question === 'string' ? input.question : 'Please provide the missing detail.',
      context: typeof input.context === 'string' ? input.context : undefined,
      placeholder: typeof input.placeholder === 'string' ? input.placeholder : undefined,
      required: typeof input.required === 'boolean' ? input.required : true,
    })
    return {
      text: 'The clarification interaction completed in the AgentILS WebView.',
      preferredSessionId,
    }
  }

  if (toolCall.name === agentilsPrivateToolNames.requestFeedback) {
    const input = toolCall.input as Record<string, unknown>
    await sessionManager.requestFeedbackThroughRuntime({
      preferredRunId,
      question: typeof input.question === 'string' ? input.question : 'Review the current AgentILS task status.',
      summary: typeof input.summary === 'string' ? input.summary : '',
      allowedActions: Array.isArray(input.allowedActions)
        ? input.allowedActions.filter((value): value is 'continue' | 'done' | 'revise' =>
            value === 'continue' || value === 'done' || value === 'revise',
          )
        : undefined,
    })
    return {
      text: 'The feedback interaction completed in the AgentILS WebView.',
      preferredSessionId,
    }
  }

  if (toolCall.name === agentilsPrivateToolNames.requestApproval) {
    const input = toolCall.input as AgentILSApprovalRequestInput
    await sessionManager.requestApprovalThroughRuntime({
      preferredRunId,
      summary: input.summary,
      riskLevel: input.riskLevel,
      targets: input.targets,
    })
    return {
      text: 'The approval interaction completed in the AgentILS WebView.',
      preferredSessionId,
    }
  }

  return {
    text: `Unknown AgentILS private tool: ${toolCall.name}`,
  }
}

export async function continueAgentILSParticipantConversation(
  request: vscode.ChatRequest,
  response: vscode.ChatResponseStream,
  sessionManager: ConversationSessionManager,
  token: vscode.CancellationToken,
  originalPrompt?: string,
) {
  const tools = createAgentILSParticipantTools()

  response.progress('AgentILS session is now running in the task console WebView.')

  while (!token.isCancellationRequested) {
    let state = sessionManager.snapshot()
    let session = state.snapshot.session

    if (!session) {
      await sessionManager.refresh()
      state = sessionManager.snapshot()
      session = state.snapshot.session
    }

    if (!session) {
      response.markdown('AgentILS session is unavailable.')
      return
    }

    if (session.status === 'finished') {
      response.markdown('AgentILS session finished in the task console.')
      return
    }

    if (getQueuedUserMessageIds(session).length === 0) {
      await waitForPanelInputOrFinish(sessionManager, token, session.sessionId)
      continue
    }

    const queuedMessageIds = [...getQueuedUserMessageIds(session)]
    const messages = compileAgentILSSessionMessages(state, originalPrompt)

    while (!token.isCancellationRequested) {
      log('chat-participant', 'session runner sendRequest', {
        sessionId: session.sessionId,
        queuedMessageCount: queuedMessageIds.length,
        messageCount: messages.length,
      })

      const modelResponse = await request.model.sendRequest(
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
            const result = await sessionManager.appendAssistantMessage(accumulatedText, 'streaming', session.runId ?? undefined, session.sessionId, assistantMessageId)
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
          await sessionManager.appendToolEvent(
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
        await sessionManager.appendAssistantMessage(accumulatedText, 'final', session.runId ?? undefined, session.sessionId, assistantMessageId)
      }

      for (const messageId of queuedMessageIds) {
        await sessionManager.consumeSessionUserMessage(messageId, session.runId ?? undefined, session.sessionId)
      }

      if (assistantParts.length > 0) {
        messages.push(vscode.LanguageModelChatMessage.Assistant(assistantParts))
      }

      if (toolCalls.length === 0) {
        break
      }

      for (const toolCall of toolCalls) {
        const toolResult = await executeAgentILSPrivateTool(sessionManager, toolCall, sessionManager.snapshot())
        await sessionManager.appendToolEvent(
          'tool_result',
          `${toolCall.name}\n${toolResult.text}`,
          'final',
          session.runId ?? undefined,
          session.sessionId,
        )
        messages.push(
          vscode.LanguageModelChatMessage.User([
            new vscode.LanguageModelToolResultPart(toolCall.callId, [new vscode.LanguageModelTextPart(toolResult.text)]),
          ]),
        )
      }

      state = sessionManager.snapshot()
      session = state.snapshot.session
      if (!session || session.status === 'finished') {
        response.markdown('AgentILS session finished in the task console.')
        return
      }
    }
  }
}
