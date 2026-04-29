import { AuditEvent } from '../types/index.js'
import { AgentGateMemoryStore } from '../store/memory-store.js'

export class AgentGateAuditLogger {
  constructor(private readonly store: AgentGateMemoryStore) {}

  info(runId: string, action: string, message: string, details?: Record<string, unknown>): AuditEvent {
    return this.store.log(runId, 'info', action, message, details)
  }

  warn(runId: string, action: string, message: string, details?: Record<string, unknown>): AuditEvent {
    return this.store.log(runId, 'warn', action, message, details)
  }

  error(runId: string, action: string, message: string, details?: Record<string, unknown>): AuditEvent {
    return this.store.log(runId, 'error', action, message, details)
  }

  list(runId: string): AuditEvent[] {
    return this.store.listAuditEvents(runId)
  }
}
