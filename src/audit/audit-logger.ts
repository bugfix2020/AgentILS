// src/audit/audit-logger.ts

import type { AuditEvent } from '../types/audit-event.js'
import type { MemoryStore } from '../store/memory-store.js'

let counter = 0

function generateAuditId(): string {
  return `audit_${Date.now()}_${++counter}`
}

export class AuditLogger {
  constructor(private store: MemoryStore) {}

  log(params: {
    userId?: string
    orgId?: string
    runId?: string
    eventType: string
    eventName: string
    payload?: Record<string, unknown>
  }): void {
    const event: AuditEvent = {
      id: generateAuditId(),
      userId: params.userId,
      orgId: params.orgId,
      runId: params.runId,
      eventType: params.eventType,
      eventName: params.eventName,
      payload: params.payload,
      createdAt: new Date().toISOString(),
    }
    this.store.addAuditEvent(event)
  }
}
