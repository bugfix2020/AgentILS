import type { WebviewToHostMessage } from './protocol'

const vscode = window.acquireVsCodeApi?.()

export function postMessage(message: WebviewToHostMessage) {
  vscode?.postMessage(message)
}
