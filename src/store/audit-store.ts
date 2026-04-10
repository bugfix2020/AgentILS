import { type AuditEvent, type RunEvent } from '../types/index.js'

export interface AuditStoreAdapter {
  appendAuditEvent(event: AuditEvent): AuditEvent
  appendRunEvent(event: RunEvent): RunEvent
  listAuditEvents(runId: string): AuditEvent[]
  listRunEvents(runId: string): RunEvent[]
}

export class AgentGateAuditStore {
  constructor(private readonly adapter: AuditStoreAdapter) {}

  listAuditEvents(runId: string): AuditEvent[] {
    return this.adapter.listAuditEvents(runId)
  }

  listRunEvents(runId: string): RunEvent[] {
    return this.adapter.listRunEvents(runId)
  }

  summarize(runId: string): { auditEvents: AuditEvent[]; runEvents: RunEvent[] } {
    return {
      auditEvents: this.adapter.listAuditEvents(runId),
      runEvents: this.adapter.listRunEvents(runId),
    }
  }
}

