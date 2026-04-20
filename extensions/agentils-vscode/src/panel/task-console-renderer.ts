import * as vscode from 'vscode'
import type { AgentILSPanelState } from '../model'
import type { TaskConsoleComposerMode } from './task-console-protocol'

function createNonce() {
  return `${Date.now()}${Math.random().toString(36).slice(2)}`
}

export function renderTaskConsoleHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  state: AgentILSPanelState,
  composerMode: TaskConsoleComposerMode,
) {
  const nonce = createNonce()
  const initialPayload = JSON.stringify({
    type: 'bootstrap',
    payload: state,
    composerMode,
  }).replace(/</g, '\\u003c')

  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'assets', 'index.js'))
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'assets', 'index.css'))

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AgentILS Task Console</title>
  <link rel="stylesheet" href="${styleUri}" />
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">window.__AGENTILS_BOOTSTRAP__ = ${initialPayload};</script>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
}
