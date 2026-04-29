/**
 * Thin HTTP client used by the VS Code extension to talk to the MCP HTTP bridge.
 * Keeps `extensions/agentils-vscode` decoupled from the MCP server's internals.
 */
import type { InteractionResponse, ToolName } from '../types/index.js'

export interface AgentilsClientOptions {
    baseUrl: string
    fetchImpl?: typeof fetch
}

export class AgentilsClient {
    private readonly baseUrl: string
    private readonly fetchImpl: typeof fetch

    constructor(opts: AgentilsClientOptions) {
        this.baseUrl = opts.baseUrl.replace(/\/$/, '')
        this.fetchImpl = opts.fetchImpl ?? fetch
    }

    async health(): Promise<boolean> {
        try {
            const r = await this.fetchImpl(`${this.baseUrl}/api/health`)
            return r.ok
        } catch {
            return false
        }
    }

    /**
     * Park a request through the MCP orchestrator and wait for the response.
     * Equivalent to invoking an MCP tool but routed through HTTP so that the
     * webview can pick up + submit the result.
     */
    async park(payload: {
        toolName: ToolName
        question: string
        context?: string
        placeholder?: string
        action?: string
        params?: Record<string, unknown>
    }): Promise<InteractionResponse> {
        const r = await this.fetchImpl(`${this.baseUrl}/api/requests`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
        })
        // Try parsing JSON body regardless of status — the bridge encodes
        // park rejections (cancelled / heartbeat-timeout) as non-2xx with a
        // structured `{ok:false, code, error}` body. We MUST re-throw with the
        // original message so the VS Code extension's `'cancelled'` /
        // `'heartbeat-timeout'` branches still match.
        let json: { ok: boolean; response?: InteractionResponse; error?: string; code?: string } | null
        try {
            json = (await r.json()) as typeof json
        } catch {
            json = null
        }
        if (!r.ok || !json || !json.ok) {
            const msg = json?.code ?? json?.error ?? `agentils park failed: ${r.status}`
            throw new Error(msg)
        }
        if (!json.response) throw new Error('agentils park returned no response')
        return json.response
    }

    async submit(
        id: string,
        body: {
            text: string
            images?: unknown
            reportContent?: string | null
            timestamp?: number
        },
    ): Promise<void> {
        await this.fetchImpl(`${this.baseUrl}/api/requests/${id}/submit`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        })
    }

    async cancel(id: string): Promise<void> {
        await this.fetchImpl(`${this.baseUrl}/api/requests/${id}/cancel`, {
            method: 'POST',
        })
    }

    async heartbeat(id: string): Promise<void> {
        await this.fetchImpl(`${this.baseUrl}/api/requests/${id}/heartbeat`, {
            method: 'POST',
        })
    }
}
