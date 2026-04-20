import * as vscode from 'vscode'
import type { TaskConsoleComposerMode } from '../panel/task-console-protocol'

export interface AgentILSInteractionChannel extends vscode.Disposable {
  revealConsole(composerMode?: TaskConsoleComposerMode, forceNewPanel?: boolean): void
}
