/**
 * Direct connection to the AgentILS MCP HTTP bridge. The webview never
 * goes through the VS Code extension for submit/cancel/heartbeat — that
 * is what keeps the architecture clean across IDEs.
 */
declare global {
  interface Window {
    __AGENTILS_MCP_URL__?: string
  }
}

export interface PendingRequest {
  id: string
  toolName: string
  question: string
  context?: string
  placeholder?: string
}

export class AgentilsBridge {
  readonly baseUrl: string

  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl ?? window.__AGENTILS_MCP_URL__ ?? 'http://127.0.0.1:8788').replace(/\/$/, '')
  }

  connect(handlers: {
    onRequest: (req: PendingRequest) => void
    onSubmitted: (id: string) => void
    onCancelled: (id: string) => void
    onExpired: (id: string) => void
  }): EventSource {
    const es = new EventSource(`${this.baseUrl}/api/events`)
    es.addEventListener('request.created', (e) => {
      const data = JSON.parse((e as MessageEvent).data)
      handlers.onRequest(data.request as PendingRequest)
    })
    es.addEventListener('request.submitted', (e) => {
      const data = JSON.parse((e as MessageEvent).data)
      handlers.onSubmitted(data.id)
    })
    es.addEventListener('request.cancelled', (e) => {
      const data = JSON.parse((e as MessageEvent).data)
      handlers.onCancelled(data.id)
    })
    es.addEventListener('request.expired', (e) => {
      const data = JSON.parse((e as MessageEvent).data)
      handlers.onExpired(data.id)
    })
    return es
  }

  async submit(id: string, text: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/requests/${id}/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  }

  async cancel(id: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/requests/${id}/cancel`, { method: 'POST' })
  }

  async heartbeat(id: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/requests/${id}/heartbeat`, { method: 'POST' })
  }
}
