import type { TaskConsoleComposerMode } from '../panel/task-console-protocol'
import type { AgentILSInteractionChannel } from './types'

export class RemoteDelegateInteractionChannel implements AgentILSInteractionChannel {
  revealConsole(_composerMode: TaskConsoleComposerMode = 'newTask') {}

  dispose() {}
}