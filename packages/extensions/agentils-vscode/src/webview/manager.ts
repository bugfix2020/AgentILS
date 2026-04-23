/**
 * Webview manager — loads the antdx UI built from `apps/webview` and wires
 * its postMessage protocol into the local MCP HTTP bridge.
 *
 * The webview itself talks directly to the MCP HTTP bridge for submit /
 * cancel / heartbeat (so the extension is just a host, not a translator).
 */
import * as vscode from 'vscode'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export class AgentilsWebviewManager {
  private panel: vscode.WebviewPanel | undefined

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly mcpHttpUrl: string,
    private readonly channel: vscode.OutputChannel,
  ) {}

  ensurePanel(): vscode.WebviewPanel {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside, true)
      return this.panel
    }

    const panel = vscode.window.createWebviewPanel(
      'agentils',
      'AgentILS',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(join(this.context.extensionPath, 'webview')),
        ],
      },
    )

    panel.webview.html = this.renderHtml(panel.webview)

    panel.onDidDispose(() => {
      this.panel = undefined
    })

    this.panel = panel
    return panel
  }

  dispose(): void {
    this.panel?.dispose()
    this.panel = undefined
  }

  private renderHtml(webview: vscode.Webview): string {
    const webviewDir = join(this.context.extensionPath, 'webview')
    const indexHtml = join(webviewDir, 'index.html')
    if (!existsSync(indexHtml)) {
      this.channel.appendLine(
        `[AgentILS] webview bundle not found at ${indexHtml}. Run \`pnpm --filter agentils-vscode-webview build\`.`,
      )
      return this.fallbackHtml()
    }

    // Build a minimal loader: the apps/webview bundle is a Vite build with
    // hashed asset names, so we just iframe-host it via a generated index
    // page that injects the bridge URL.
    const baseUri = webview.asWebviewUri(vscode.Uri.file(webviewDir))
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src ${webview.cspSource}`,
      `font-src ${webview.cspSource}`,
      `img-src ${webview.cspSource} data:`,
      `connect-src http://127.0.0.1:* https://127.0.0.1:*`,
    ].join('; ')

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <base href="${baseUri}/" />
  <title>AgentILS</title>
  <script>window.__AGENTILS_MCP_URL__ = ${JSON.stringify(this.mcpHttpUrl)};</script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./assets/index.js"></script>
</body>
</html>`
  }

  private fallbackHtml(): string {
    return `<!doctype html>
<html><body style="font-family: system-ui; padding: 16px;">
  <h2>AgentILS webview not built</h2>
  <p>Run <code>pnpm --filter agentils-vscode-webview build</code> and reload.</p>
</body></html>`
  }
}
