import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  AuditEvent,
  AuditEventSchema,
  HandoffPacket,
  HandoffPacketSchema,
  RunEvent,
  RunEventSchema,
  RunRecord,
  RunRecordSchema,
  TaskCard,
  TaskCardSchema,
} from '../types/index.js'

export interface PersistentStoreMeta {
  lastRunId: string | null
  updatedAt: string
}

export interface PersistentStoreData {
  meta: PersistentStoreMeta
  runs: RunRecord[]
  taskCards: TaskCard[]
  handoffs: HandoffPacket[]
  auditEvents: AuditEvent[]
  runEvents: RunEvent[]
}

export const DEFAULT_STATE_FILE = '.data/agentils-state.json'

function createEmptyStoreData(): PersistentStoreData {
  return {
    meta: {
      lastRunId: null,
      updatedAt: new Date().toISOString(),
    },
    runs: [],
    taskCards: [],
    handoffs: [],
    auditEvents: [],
    runEvents: [],
  }
}

export function resolveStateFilePath(explicitPath?: string): string {
  return resolve(explicitPath ?? process.env.AGENTILS_STATE_FILE ?? DEFAULT_STATE_FILE)
}

export function loadPersistentStore(filePath = resolveStateFilePath()): PersistentStoreData {
  try {
    const raw = readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      meta: {
        lastRunId: typeof parsed.meta === 'object' && parsed.meta && 'lastRunId' in parsed.meta ? (parsed.meta.lastRunId as string | null) : null,
        updatedAt:
          typeof parsed.meta === 'object' && parsed.meta && 'updatedAt' in parsed.meta && typeof parsed.meta.updatedAt === 'string'
            ? parsed.meta.updatedAt
            : new Date().toISOString(),
      },
      runs: RunRecordSchema.array().parse(parsed.runs ?? []),
      taskCards: TaskCardSchema.array().parse(parsed.taskCards ?? []),
      handoffs: HandoffPacketSchema.array().parse(parsed.handoffs ?? []),
      auditEvents: AuditEventSchema.array().parse(parsed.auditEvents ?? []),
      runEvents: RunEventSchema.array().parse(parsed.runEvents ?? []),
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return createEmptyStoreData()
    }
    throw error
  }
}

export function savePersistentStore(data: PersistentStoreData, filePath = resolveStateFilePath()): void {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(
    filePath,
    JSON.stringify(
      {
        ...data,
        meta: {
          ...data.meta,
          updatedAt: new Date().toISOString(),
        },
      },
      null,
      2,
    ),
    'utf8',
  )
}
