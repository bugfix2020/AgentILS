// src/types/user.ts

export type User = {
  id: string
  email?: string
  emailVerified: boolean
  authProvider?: 'github' | 'microsoft' | 'google' | 'custom'
  orgId?: string
  planId?: string
  createdAt: string
  updatedAt: string
}
