// src/store/json-persistence.ts

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'

export type StoreData = {
  users: Record<string, unknown>
  plans: Record<string, unknown>
  accessPolicies: Record<string, unknown>
  runs: Record<string, unknown>
  steps: unknown[]
  toolPolicies: Record<string, unknown>
  auditEvents: unknown[]
}

const EMPTY_DATA: StoreData = {
  users: {},
  plans: {},
  accessPolicies: {},
  runs: {},
  steps: [],
  toolPolicies: {},
  auditEvents: [],
}

export class JsonPersistence {
  private filePath: string

  constructor(filePath: string) {
    this.filePath = filePath
  }

  load(): StoreData {
    if (!existsSync(this.filePath)) {
      return { ...EMPTY_DATA }
    }
    try {
      const raw = readFileSync(this.filePath, 'utf-8')
      const data = JSON.parse(raw) as Partial<StoreData>
      return {
        users: data.users ?? {},
        plans: data.plans ?? {},
        accessPolicies: data.accessPolicies ?? {},
        runs: data.runs ?? {},
        steps: data.steps ?? [],
        toolPolicies: data.toolPolicies ?? {},
        auditEvents: data.auditEvents ?? [],
      }
    } catch {
      console.error(`[agent-gate] Failed to load ${this.filePath}, starting fresh`)
      return { ...EMPTY_DATA }
    }
  }

  save(data: StoreData): void {
    const dir = dirname(this.filePath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8')
  }
}
