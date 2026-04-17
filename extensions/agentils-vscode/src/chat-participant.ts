import * as vscode from 'vscode'
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
  const participant = vscode.chat.createChatParticipant('agentils.agentils', async (request, _chatContext, response) => {
    const prompt = request.prompt.trim()
    log('chat-participant', 'request received', { prompt, command: request.command })

    if (!prompt) {
      response.progress('Opening AgentILS task console…')
      await vscode.commands.executeCommand('agentils.openTaskConsole')
      response.markdown('AgentILS task console opened. Provide the task details in the panel or send `@agentils <task>`.')
      return
    }

    response.progress('Starting AgentILS task…')
    const title = buildTaskTitle(prompt)

    try {
      await sessionManager.startTaskGate({
        title,
        goal: prompt,
        controlMode: 'normal',
      })
      response.markdown(`AgentILS started \`${title}\` and opened the task console.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start the AgentILS task.'
      log('chat-participant', 'request failed', { error: message })
      response.markdown(`AgentILS failed to start the task console.\n\n${message}`)
    }
  })

  participant.iconPath = new vscode.ThemeIcon('hubot')
  context.subscriptions.push(participant)
}
