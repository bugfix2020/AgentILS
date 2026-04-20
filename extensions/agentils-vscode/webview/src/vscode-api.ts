import type { TaskConsoleMessage } from './types'

declare global {
  interface Window {
    __AGENTILS_BOOTSTRAP__?: unknown
    acquireVsCodeApi?: () => { postMessage: (message: TaskConsoleMessage) => void }
  }
}

const vscode = window.acquireVsCodeApi?.()

export function postMessage(message: TaskConsoleMessage) {
  vscode?.postMessage(message)
}
