/**
 * Webview manager — loads the antdx UI built from `apps/webview` and wires
 * its postMessage protocol into the local MCP HTTP bridge.
 *
 * The webview only speaks the postMessage protocol. This manager translates
 * semantic UI messages to the local MCP HTTP bridge.
 */
import * as vscode from 'vscode'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Logger } from '@agentils/logger'
import type { StateSnapshot } from '@agentils/mcp/types'
import type {
    HostToWebviewMessage,
    InteractionView,
    PromptFileView,
    ReplyTemplate,
    ToolView,
    ToolName,
    WebviewToHostMessage,
    WebviewError,
    WebviewViewModel,
    WorkspaceFileContentView,
} from './protocol.js'

interface StateResponse {
    ok?: boolean
    snapshot?: StateSnapshot
}

const DEFAULT_HOST_HEARTBEAT_MS = 20_000

export class AgentilsWebviewManager {
    private panel: vscode.WebviewPanel | undefined
    private eventAbort: AbortController | undefined
    private reconnectTimer: NodeJS.Timeout | undefined
    private hostHeartbeatTimer: NodeJS.Timeout | undefined
    private hostHeartbeatIds = new Set<string>()
    private version = 0

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly mcpHttpUrl: string,
        private readonly log: Logger,
    ) {}

    ensurePanel(): vscode.WebviewPanel {
        if (this.panel) {
            this.log.info('webview reveal existing panel', {
                operation: 'webview.reveal',
                baseUrl: this.mcpHttpUrl,
                panelState: 'existing',
            })
            this.panel.reveal(this.getConfiguredViewColumn(), true)
            return this.panel
        }

        const viewColumn = this.getConfiguredViewColumn()
        this.log.info('webview create panel', {
            operation: 'webview.create',
            baseUrl: this.mcpHttpUrl,
            panelState: 'creating',
            viewColumn,
        })
        const panel = vscode.window.createWebviewPanel(
            'agentils',
            'AgentILS',
            { viewColumn, preserveFocus: true },
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.file(join(this.context.extensionPath, 'webview'))],
            },
        )

        panel.webview.html = this.renderHtml(panel.webview)
        panel.webview.onDidReceiveMessage((message: WebviewToHostMessage) => {
            void this.handleWebviewMessage(message)
        })
        this.log.info('webview html assigned', {
            operation: 'webview.htmlAssigned',
            baseUrl: this.mcpHttpUrl,
            htmlLength: panel.webview.html.length,
        })

        panel.onDidDispose(() => {
            this.log.info('webview disposed', {
                operation: 'webview.dispose',
                baseUrl: this.mcpHttpUrl,
                panelState: 'disposed',
            })
            this.stopEventStream()
            this.stopHostHeartbeat()
            this.panel = undefined
        })

        this.panel = panel
        this.startEventStream()
        void this.renderFromMcp()
        return panel
    }

    dispose(): void {
        if (this.panel) {
            this.log.info('webview manager dispose', {
                operation: 'webview.manager.dispose',
                baseUrl: this.mcpHttpUrl,
            })
        }
        this.stopEventStream()
        this.stopHostHeartbeat()
        this.panel?.dispose()
        this.panel = undefined
    }

    async renderFromMcp(): Promise<void> {
        if (!this.panel) return
        try {
            const snapshot = await this.fetchState()
            await this.renderSnapshot(snapshot)
        } catch (err) {
            const message = (err as Error).message
            this.log.warn('webview render failed', {
                operation: 'webview.render.failed',
                error: message,
            })
            await this.post({ type: 'show_error', payload: { message } })
        }
    }

    private async renderSnapshot(snapshot: StateSnapshot): Promise<void> {
        if (!this.panel) return
        this.updateHostHeartbeat(snapshot.interactions.pending.map((request) => request.id))
        const model = this.buildViewModel(snapshot)
        await this.post({ type: 'render', payload: model })
    }

    private startEventStream(): void {
        if (this.eventAbort) return
        const controller = new AbortController()
        this.eventAbort = controller
        void this.consumeEventStream(controller)
    }

    private stopEventStream(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer)
            this.reconnectTimer = undefined
        }
        this.eventAbort?.abort()
        this.eventAbort = undefined
    }

    private updateHostHeartbeat(ids: string[]): void {
        this.hostHeartbeatIds = new Set(ids)
        if (this.hostHeartbeatIds.size > 0) {
            this.startHostHeartbeat()
            return
        }
        this.stopHostHeartbeat()
    }

    private startHostHeartbeat(): void {
        if (this.hostHeartbeatTimer) return
        this.hostHeartbeatTimer = setInterval(() => {
            void this.sendHostHeartbeats()
        }, this.getHostHeartbeatMs())
    }

    private stopHostHeartbeat(): void {
        if (this.hostHeartbeatTimer) {
            clearInterval(this.hostHeartbeatTimer)
            this.hostHeartbeatTimer = undefined
        }
        this.hostHeartbeatIds.clear()
    }

    private async sendHostHeartbeats(): Promise<void> {
        const ids = Array.from(this.hostHeartbeatIds)
        await Promise.all(
            ids.map(async (id) => {
                try {
                    await this.postJson(`/api/requests/${encodeURIComponent(id)}/heartbeat`)
                } catch (err) {
                    this.log.warn('host heartbeat failed', {
                        operation: 'webview.hostHeartbeat.failed',
                        requestId: id,
                        error: (err as Error).message,
                    })
                }
            }),
        )
    }

    private getHostHeartbeatMs(): number {
        const configured = vscode.workspace.getConfiguration('agentils').get<number>('webview.hostHeartbeatMs')
        return typeof configured === 'number' && Number.isFinite(configured) && configured > 0
            ? configured
            : DEFAULT_HOST_HEARTBEAT_MS
    }

    private async consumeEventStream(controller: AbortController): Promise<void> {
        try {
            const response = await fetch(`${this.mcpHttpUrl}/api/events`, { signal: controller.signal })
            if (!response.ok || !response.body) throw new Error(`event stream failed: ${response.status}`)
            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''
            for (;;) {
                const read = await reader.read()
                if (read.done) break
                buffer += decoder.decode(read.value, { stream: true })
                buffer = await this.consumeSseBuffer(buffer)
            }
        } catch (err) {
            if (!controller.signal.aborted) {
                this.log.warn('webview event stream failed', {
                    operation: 'webview.events.failed',
                    error: (err as Error).message,
                })
            }
        } finally {
            if (this.eventAbort === controller) this.eventAbort = undefined
            if (this.panel && !controller.signal.aborted && !this.reconnectTimer) {
                this.reconnectTimer = setTimeout(() => {
                    this.reconnectTimer = undefined
                    this.startEventStream()
                }, 1000)
            }
        }
    }

    private async consumeSseBuffer(buffer: string): Promise<string> {
        const records = buffer.split(/\r?\n\r?\n/)
        const remainder = records.pop() ?? ''
        for (const record of records) {
            await this.handleSseRecord(record)
        }
        return remainder
    }

    private async handleSseRecord(record: string): Promise<void> {
        const dataLines = record
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice('data:'.length).trimStart())
        if (dataLines.length === 0) return
        let event: unknown
        try {
            event = JSON.parse(dataLines.join('\n'))
        } catch (err) {
            this.log.warn('webview event parse failed', {
                operation: 'webview.events.parseFailed',
                error: (err as Error).message,
            })
            return
        }
        if (!isRecord(event)) return
        if (event.type === 'state.changed' && isRecord(event.snapshot)) {
            await this.renderSnapshot(event.snapshot as unknown as StateSnapshot)
            return
        }
        if (typeof event.type === 'string' && event.type.startsWith('request.')) {
            await this.renderFromMcp()
        }
    }

    private async handleWebviewMessage(message: WebviewToHostMessage): Promise<void> {
        this.log.info('webview message received', {
            operation: 'webview.message.received',
            type: message.type,
        })
        switch (message.type) {
            case 'ready':
                await this.renderFromMcp()
                return
            case 'rendered':
                return
            case 'submit_interaction_result':
                await this.postJson(`/api/requests/${encodeURIComponent(message.payload.interactionId)}/submit`, {
                    text: message.payload.text,
                    images: message.payload.images,
                    reportContent: message.payload.reportContent,
                    timestamp: Date.now(),
                })
                await this.renderFromMcp()
                return
            case 'cancel_interaction':
                await this.postJson(`/api/requests/${encodeURIComponent(message.payload.interactionId)}/cancel`)
                await this.renderFromMcp()
                return
            case 'heartbeat':
                await this.postJson(`/api/requests/${encodeURIComponent(message.payload.interactionId)}/heartbeat`)
                return
            case 'client_error':
                this.log.warn('webview client error', {
                    operation: 'webview.clientError',
                    message: message.payload.message,
                    stack: message.payload.stack,
                })
                return
            case 'request_prompt_files':
                await this.post({
                    type: 'prompt_files_result',
                    payload: {
                        query: message.payload.query,
                        items: await this.findPromptFiles(message.payload.query),
                    },
                })
                return
            case 'request_tools':
                await this.post({
                    type: 'tools_result',
                    payload: {
                        query: message.payload.query,
                        items: this.findTools(message.payload.query),
                    },
                })
                return
            case 'read_workspace_file':
                await this.post({
                    type: 'workspace_file_result',
                    payload: await this.readWorkspaceFile(message.payload.path, message.payload.range),
                })
                return
        }
    }

    private buildViewModel(snapshot: StateSnapshot): WebviewViewModel {
        const pending = snapshot.interactions.pending.map(toInteractionView)
        const appendAttachmentContent = vscode.workspace
            .getConfiguration('agentils')
            .get<boolean>('webview.appendAttachmentContent', true)
        return {
            version: snapshot.version || ++this.version,
            connection: {
                status: 'ready',
                baseUrl: this.mcpHttpUrl,
            },
            content: {
                collect: {},
                plan: { conflicts: [] },
                execute: {},
                test: {},
                summarize: {},
            },
            interactions: {
                activeId: pending[0]?.id,
                items: pending,
            },
            templates: {
                global: this.loadTemplates(),
                byTool: {
                    request_user_clarification: this.loadTemplates('templates.clarification'),
                    request_contact_user: this.loadTemplates('templates.contact'),
                    request_user_feedback: this.loadTemplates('templates.feedback'),
                    request_dynamic_action: this.loadTemplates('templates.global'),
                },
            },
            capabilities: {
                images: true,
                fileRead: true,
                appendAttachmentContent,
                promptList: true,
                toolList: true,
            },
            errors: [],
        }
    }

    private async fetchState(): Promise<StateSnapshot> {
        const response = await fetch(`${this.mcpHttpUrl}/api/state`)
        if (!response.ok) throw new Error(`state request failed: ${response.status}`)
        const data = (await response.json()) as StateResponse
        if (!data.snapshot) throw new Error('state response missing snapshot')
        return data.snapshot
    }

    private async findPromptFiles(query?: string): Promise<PromptFileView[]> {
        const lowerQuery = query?.trim().toLowerCase() ?? ''
        const workspaceMatches = await vscode.workspace.findFiles(
            '**/*.{prompt.md,agent.md,instructions.md}',
            '{**/node_modules/**,**/.git/**,**/dist/**,**/out/**}',
            50,
        )
        return workspaceMatches
            .map((uri) => {
                const relativePath = vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/')
                return {
                    label: relativePath.split('/').at(-1) ?? relativePath,
                    value: relativePath,
                    description: relativePath,
                    source: 'workspace' as const,
                }
            })
            .filter(
                (item) =>
                    !lowerQuery ||
                    item.label.toLowerCase().includes(lowerQuery) ||
                    item.description.toLowerCase().includes(lowerQuery),
            )
    }

    private findTools(query?: string): ToolView[] {
        const lowerQuery = query?.trim().toLowerCase() ?? ''
        const tools: ToolView[] = []
        for (const extension of vscode.extensions.all) {
            const contributed = extension.packageJSON?.contributes?.languageModelTools
            if (!Array.isArray(contributed)) continue
            for (const tool of contributed) {
                const name = String(tool.name ?? '')
                const label = String(tool.toolReferenceName ?? name)
                const displayName = tool.displayName ? String(tool.displayName) : undefined
                const description = tool.modelDescription ? String(tool.modelDescription) : undefined
                if (
                    !name ||
                    (lowerQuery &&
                        !`${label} ${displayName ?? ''} ${description ?? ''}`.toLowerCase().includes(lowerQuery))
                )
                    continue
                tools.push({ label, value: name, displayName, description })
            }
        }
        return tools.slice(0, 50)
    }

    private async readWorkspaceFile(
        pathOrRelativePath: string,
        range?: { start: number; end: number },
    ): Promise<WorkspaceFileContentView | WebviewError> {
        try {
            const uri = await resolveWorkspaceFile(pathOrRelativePath)
            if (!uri) return { message: `File is outside the workspace or cannot be resolved: ${pathOrRelativePath}` }
            const bytes = await vscode.workspace.fs.readFile(uri)
            const content = new TextDecoder().decode(bytes)
            const lines = content.split(/\r?\n/)
            const start = range ? Math.max(1, Math.floor(range.start)) : 1
            const end = range ? Math.min(lines.length, Math.max(start, Math.floor(range.end))) : lines.length
            return {
                path: vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/'),
                content: lines.slice(start - 1, end).join('\n'),
                range: range ? { start, end } : undefined,
            }
        } catch (err) {
            return { message: (err as Error).message }
        }
    }

    private async postJson(path: string, body?: unknown): Promise<void> {
        const response = await fetch(`${this.mcpHttpUrl}${path}`, {
            method: 'POST',
            headers: body ? { 'content-type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined,
        })
        if (!response.ok) throw new Error(`${path} failed: ${response.status}`)
    }

    private async post(message: HostToWebviewMessage): Promise<void> {
        if (!this.panel) return
        await this.panel.webview.postMessage(message)
    }

    private getConfiguredViewColumn(): vscode.ViewColumn {
        const value = vscode.workspace.getConfiguration('agentils').get<string>('webview.viewColumn', 'beside')
        return value === 'active' ? vscode.ViewColumn.Active : vscode.ViewColumn.Beside
    }

    private renderHtml(webview: vscode.Webview): string {
        const webviewDir = join(this.context.extensionPath, 'webview')
        const indexHtml = join(webviewDir, 'index.html')
        if (!existsSync(indexHtml)) {
            this.log.warn('webview bundle not found', {
                operation: 'webview.loadViewContent.missingBundle',
                path: indexHtml,
            })
            return this.fallbackHtml()
        }

        const baseUri = webview.asWebviewUri(vscode.Uri.file(webviewDir))
        const csp = [
            `default-src 'none'`,
            `style-src ${webview.cspSource} 'unsafe-inline'`,
            `script-src ${webview.cspSource}`,
            `font-src ${webview.cspSource}`,
            `img-src ${webview.cspSource} data:`,
        ].join('; ')

        return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <base href="${baseUri}/" />
  <title>AgentILS</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./assets/index.js"></script>
</body>
</html>`
    }

    private loadTemplates(settingKey?: string): ReplyTemplate[] {
        const cfg = vscode.workspace.getConfiguration('agentils')
        const global = cfg.get<ReplyTemplate[]>('templates.global', [])
        const specific = settingKey ? cfg.get<ReplyTemplate[]>(settingKey, []) : []
        const templates = mergeTemplates(global, specific)
        return templates.length > 0 ? templates : [{ name: 'Direct Response', template: '{{INPUT_CONTENT}}' }]
    }

    private fallbackHtml(): string {
        return `<!doctype html>
<html><body style="font-family: system-ui; padding: 16px;">
  <h2>AgentILS webview not built</h2>
  <p>Run <code>pnpm --filter agentils-vscode-webview build</code> and reload.</p>
</body></html>`
    }
}

function normalizeToolName(value: unknown): ToolName {
    switch (value) {
        case 'request_contact_user':
        case 'request_user_feedback':
        case 'request_dynamic_action':
        case 'request_user_clarification':
            return value
        default:
            return 'request_user_clarification'
    }
}

function toInteractionView(request: StateSnapshot['interactions']['pending'][number]): InteractionView {
    return {
        id: request.id,
        toolName: normalizeToolName(request.toolName),
        question: request.question,
        context: request.context,
        placeholder: request.placeholder,
        status: request.status,
        createdAt: request.createdAt,
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function mergeTemplates(global: ReplyTemplate[], specific: ReplyTemplate[]): ReplyTemplate[] {
    const byName = new Map<string, ReplyTemplate>()
    for (const template of global) byName.set(template.name, template)
    for (const template of specific) byName.set(template.name, template)
    return Array.from(byName.values())
}

async function resolveWorkspaceFile(pathOrRelativePath: string): Promise<vscode.Uri | undefined> {
    const workspaceFolders = vscode.workspace.workspaceFolders ?? []
    if (workspaceFolders.length === 0) return undefined
    const normalized = pathOrRelativePath.replace(/\\/g, '/')
    const candidates: vscode.Uri[] = []

    if (/^[a-zA-Z]:[\\/]/.test(pathOrRelativePath) || pathOrRelativePath.startsWith('/')) {
        candidates.push(vscode.Uri.file(pathOrRelativePath))
    } else {
        for (const folder of workspaceFolders) {
            candidates.push(vscode.Uri.joinPath(folder.uri, normalized))
        }
    }

    for (const candidate of candidates) {
        const belongsToWorkspace = workspaceFolders.some((folder) => {
            const folderPath = folder.uri.fsPath.replace(/\\/g, '/').replace(/\/$/, '')
            const candidatePath = candidate.fsPath.replace(/\\/g, '/')
            return candidatePath === folderPath || candidatePath.startsWith(`${folderPath}/`)
        })
        if (!belongsToWorkspace) continue
        try {
            const stat = await vscode.workspace.fs.stat(candidate)
            if (stat.type === vscode.FileType.File) return candidate
        } catch {
            // Try the next candidate.
        }
    }
    return undefined
}
