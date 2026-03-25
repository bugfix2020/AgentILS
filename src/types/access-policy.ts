// src/types/access-policy.ts

export type AccessPolicy = {
  id: string
  allowedEmails: string[]
  allowedDomains: string[]
  blockedMcpServers: string[]
  blockedTools: string[]
  highRiskTools: string[]
}
