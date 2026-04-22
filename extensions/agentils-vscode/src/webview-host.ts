import * as vscode from 'vscode'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { extensionLogger } from './logger'
import type { RunTaskLoopResult, StateSnapshot, TaskInteractionResult } from './types'
import type { HostToWebviewMessage, WebviewToHostMessage } from './webview-protocol'
import { isWebviewToHostMessage } from './webview-protocol'
import { buildWebviewViewModelFromResult, buildWebviewViewModelFromSnapshot } from './webview-view-model'

interface PanelResponse {
    actionId?: TaskInteractionResult['actionId']
    message?: string
    closed?: boolean
}

export class AgentILSLoopWebviewHost implements vscode.Disposable {
    private panel: vscode.WebviewPanel | null = null
    private pendingResolver: ((value: PanelResponse) => void) | null = null
    private webviewReady = false
    private latestMessage: HostToWebviewMessage = {
        type: 'render',
        payload: buildWebviewViewModelFromSnapshot({
            session: {
                sessionId: 'session_bootstrap',
                status: 'closed',
                activeTaskId: null,
                taskIds: [],
                createdAt: '',
                updatedAt: '',
            },
            task: null,
            tasks: [],
            timeline: [],
        }),
    }

    constructor(private readonly context: vscode.ExtensionContext) {}

    dispose() {
        this.resolvePending({ closed: true })
        this.panel?.dispose()
        this.panel = null
    }

    showSnapshot(snapshot: StateSnapshot) {
        extensionLogger.log('webview-host', 'showSnapshot', {
            hasTask: Boolean(snapshot.task),
            timelineLength: snapshot.timeline.length,
        })
        this.renderViewModel({
            type: 'render',
            payload: buildWebviewViewModelFromSnapshot(snapshot),
        })
    }

    render(result: RunTaskLoopResult) {
        extensionLogger.log('webview-host', 'render', {
            phase: result.task.phase,
            terminal: result.task.terminal,
            hasInteraction: Boolean(result.interaction),
            timelineLength: result.snapshot.timeline.length,
        })
        this.renderViewModel({
            type: 'render',
            payload: buildWebviewViewModelFromResult(result),
        })
    }

    async collect(result: RunTaskLoopResult): Promise<PanelResponse> {
        this.render(result)
        const panel = this.ensurePanel()
        panel.reveal(vscode.ViewColumn.Active, false)
        extensionLogger.log('webview-host', 'collect:awaiting-user', {
            interactionKey: result.interaction?.interactionKey,
            requestId: result.interaction?.requestId,
        })
        return new Promise<PanelResponse>((resolve) => {
            this.pendingResolver = resolve
        })
    }

    private ensurePanel() {
        if (this.panel) {
            extensionLogger.log('webview-host', 'ensurePanel:reuse')
            return this.panel
        }

        extensionLogger.log('webview-host', 'ensurePanel:create')
        const localResourceRoots = [vscode.Uri.file(this.getWebviewDistPath())]
        this.panel = vscode.window.createWebviewPanel('agentils.loop', 'AgentILS', vscode.ViewColumn.Active, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots,
        })
        this.panel.webview.html = this.renderShellHtml(this.panel)
        this.panel.reveal(vscode.ViewColumn.Active, false)

        this.panel.onDidDispose(
            () => {
                extensionLogger.log('webview-host', 'panel:disposed')
                this.panel = null
                this.webviewReady = false
                this.resolvePending({ closed: true })
            },
            null,
            this.context.subscriptions,
        )

        this.panel.webview.onDidReceiveMessage(
            (message: unknown) => {
                this.handleWebviewMessage(message)
            },
            null,
            this.context.subscriptions,
        )

        this.panel.onDidChangeViewState(
            (event) => {
                extensionLogger.log('webview-host', 'panel:view-state', {
                    active: event.webviewPanel.active,
                    visible: event.webviewPanel.visible,
                    title: event.webviewPanel.title,
                })
            },
            null,
            this.context.subscriptions,
        )

        return this.panel
    }

    private handleWebviewMessage(message: unknown) {
        if (!isWebviewToHostMessage(message)) {
            extensionLogger.log('webview-host', 'panel:unknown-message', { message: stringifyForUi(message) })
            return
        }

        const incoming = message as WebviewToHostMessage

        switch (incoming.type) {
            case 'ready':
                extensionLogger.log('webview-host', 'panel:ready')
                this.webviewReady = true
                this.postMessage(this.latestMessage)
                return
            case 'rendered':
                extensionLogger.log('webview-host', 'panel:rendered')
                return
            case 'client_error':
                extensionLogger.log('webview-host', 'panel:client-error', incoming.payload)
                return
            case 'ui_closed':
                extensionLogger.log('webview-host', 'panel:ui-closed', incoming.payload)
                return
            case 'submit_user_message':
                extensionLogger.log('webview-host', 'panel:submit-user-message', {
                    length: incoming.payload.message.length,
                })
                this.resolvePending({ message: incoming.payload.message })
                return
            case 'submit_interaction_result':
                extensionLogger.log('webview-host', 'panel:submit-interaction-result', incoming.payload)
                this.resolvePending({
                    actionId: incoming.payload.actionId,
                    message: incoming.payload.message,
                })
                return
            default:
                extensionLogger.log('webview-host', 'panel:unhandled-message', incoming)
        }
    }

    private renderViewModel(message: HostToWebviewMessage) {
        this.latestMessage = message
        const panel = this.ensurePanel()
        panel.reveal(vscode.ViewColumn.Active, false)
        if (!this.webviewReady) {
            extensionLogger.log('webview-host', 'render:queued', { type: message.type })
            return
        }
        this.postMessage(message)
    }

    private postMessage(message: HostToWebviewMessage) {
        if (!this.panel) {
            return
        }

        extensionLogger.log('webview-host', 'postMessage', { type: message.type })
        void this.panel.webview.postMessage(message)
    }

    private renderShellHtml(panel: vscode.WebviewPanel) {
        const distPath = this.getWebviewDistPath()
        const indexPath = join(distPath, 'index.html')

        if (!existsSync(indexPath)) {
            return this.renderMissingBuildHtml(indexPath)
        }

        const resourcesRoot = panel.webview.asWebviewUri(vscode.Uri.file(distPath)).toString()
        const nonce = buildNonce()
        let html = readFileSync(indexPath, 'utf8')
            .replace(/(href|src)="\.\/assets\//g, `$1="${resourcesRoot}/assets/`)
            .replace(/<script type="module" crossorigin/g, `<script nonce="${nonce}" type="module" crossorigin`)
            .replace(/<script type="module"/g, `<script nonce="${nonce}" type="module"`)

        const bootstrapScript = `<script nonce="${nonce}">window.__AGENTILS_BOOTSTRAP__ = ${JSON.stringify(this.latestMessage)};</script>`
        const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${panel.webview.cspSource} data:; style-src ${panel.webview.cspSource} 'unsafe-inline'; script-src ${panel.webview.cspSource} 'unsafe-inline'; font-src ${panel.webview.cspSource};">`

        html = html.replace('</head>', `  ${csp}\n  ${bootstrapScript}\n</head>`)
        return html
    }

    private renderMissingBuildHtml(indexPath: string) {
        return `<!DOCTYPE html>
<html lang="zh-CN">
  <body style="font-family: sans-serif; padding: 24px;">
    <h2>AgentILS WebView build missing</h2>
    <p>Expected built webview entry:</p>
    <pre>${escapeHtml(indexPath)}</pre>
    <p>Run the extension build to generate dist/webview before opening the panel.</p>
  </body>
</html>`
    }

    private getWebviewDistPath() {
        return join(this.context.extensionPath, 'dist', 'webview')
    }

    private resolvePending(value: PanelResponse) {
        extensionLogger.log('webview-host', 'resolvePending', value)
        const resolver = this.pendingResolver
        this.pendingResolver = null
        resolver?.(value)
    }
}

function buildNonce() {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
}

function stringifyForUi(value: unknown): string {
    if (typeof value === 'string') {
        return value
    }
    if (value == null) {
        return ''
    }
    try {
        return JSON.stringify(value, null, 2)
    } catch {
        return String(value)
    }
}

function escapeHtml(value: string) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;')
}
