import * as vscode from 'vscode'
import { continueAgentILSParticipantConversation } from './chat-participant-followup'
import { log } from './logger'
import type { ConversationSessionManager } from './session/conversation-session-manager'

function buildTaskTitle(prompt: string) {
  const normalized = prompt.trim().replace(/\s+/g, ' ')
  if (!normalized) {
    return 'AgentILS task'
  }
  if (normalized.length <= 48) {
    return normalized
  }
  return `${normalized.slice(0, 47)}…`
}

export function registerAgentILSChatParticipant(
  context: vscode.ExtensionContext,
  sessionManager: ConversationSessionManager,
) {
  const participant = vscode.chat.createChatParticipant('agentils.agentils', async (request, _chatContext, response, token) => {
    const prompt = request.prompt.trim()
    log('chat-participant', 'request received', { prompt, command: request.command })

    try {
      // Open the WebView panel, then keep the Copilot turn alive by
      // blocking on the session-driven continuation loop. The loop waits
      // for user input from the WebView, sends it to the LLM, streams
      // back, and repeats — achieving multi-round interaction in a single
      // Copilot prompt.
      response.progress('Opening AgentILS task console…')
      sessionManager.revealConsole('newTask', true)
      sessionManager.participantLoopActive = true
      try {
        await continueAgentILSParticipantConversation(request, response, sessionManager, token, prompt)
      } finally {
        sessionManager.participantLoopActive = false
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start the AgentILS task.'
      log('chat-participant', 'request failed', {
        error: message,
        stack: error instanceof Error ? error.stack : undefined,
      })
      response.markdown(`AgentILS failed to start the task console.\n\n${message}`)
    }
  })

  participant.iconPath = new vscode.ThemeIcon('hubot')
  context.subscriptions.push(participant)
}
