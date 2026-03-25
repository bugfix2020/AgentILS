// src/types/audit-event.ts

export type AuditEvent = {
  id: string
  userId?: string
  orgId?: string
  runId?: string
  eventType: string
  eventName: string
  payload?: Record<string, unknown>
  createdAt: string
}
