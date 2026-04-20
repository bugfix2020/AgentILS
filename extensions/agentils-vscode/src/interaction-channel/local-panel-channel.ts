import * as vscode from 'vscode'
import { TaskConsolePanel, type TaskConsoleComposerMode } from '../task-console-panel'
import type { AgentILSInteractionChannel } from './types'
import type { ConversationSessionManager } from '../session/conversation-session-manager'

export class LocalPanelInteractionChannel implements AgentILSInteractionChannel {
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly sessionManager: ConversationSessionManager,
  ) {}

  revealConsole(composerMode: TaskConsoleComposerMode = 'newTask', forceNewPanel = false) {
    TaskConsolePanel.createOrShow(this.extensionUri, this.sessionManager, composerMode, undefined, forceNewPanel)
  }

  dispose() {}
}
