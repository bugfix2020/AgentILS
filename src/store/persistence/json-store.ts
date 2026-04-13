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
} from '../../types/index.js'
import { isControlMode } from '../../control/control-modes.js'

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

export interface JsonStoreEntry<T> {
  read(): T
  write(next: T): void
  update(mutator: (current: T) => T): T
}

export const DEFAULT_STATE_FILE = '.data/agentils-state.json'

function repairLegacyModeFields<T>(entry: T): T {
  if (!entry || typeof entry !== 'object') {
    return entry
  }

  const record = { ...(entry as Record<string, unknown>) }
  const legacyCurrentMode = typeof record.currentMode === 'string' ? record.currentMode : null
  const explicitControlMode = typeof record.controlMode === 'string' ? record.controlMode : null

  if (legacyCurrentMode && isControlMode(legacyCurrentMode)) {
    record.controlMode = isControlMode(explicitControlMode) ? explicitControlMode : legacyCurrentMode
    record.currentMode = 'execution_intent'
  }

  if (!isControlMode(record.controlMode)) {
    record.controlMode = 'normal'
  }

  return record as T
}

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
    if (!raw.trim()) {
      return createEmptyStoreData()
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      meta: {
        lastRunId:
          typeof parsed.meta === 'object' && parsed.meta && 'lastRunId' in parsed.meta
            ? (parsed.meta.lastRunId as string | null)
            : null,
        updatedAt:
          typeof parsed.meta === 'object' &&
          parsed.meta &&
          'updatedAt' in parsed.meta &&
          typeof parsed.meta.updatedAt === 'string'
            ? parsed.meta.updatedAt
            : new Date().toISOString(),
      },
      runs: RunRecordSchema.array().parse(Array.isArray(parsed.runs) ? parsed.runs.map(repairLegacyModeFields) : []),
      taskCards: TaskCardSchema.array().parse(
        Array.isArray(parsed.taskCards) ? parsed.taskCards.map(repairLegacyModeFields) : [],
      ),
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

export class JsonFileStore<T extends object> implements JsonStoreEntry<T> {
  constructor(
    private readonly filePath: string,
    private readonly fallback: T,
  ) {}

  read(): T {
    try {
      const raw = readFileSync(this.filePath, 'utf8')
      if (!raw.trim()) {
        return this.fallback
      }
      return JSON.parse(raw) as T
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return this.fallback
      }
      throw error
    }
  }

  write(next: T): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(next, null, 2), 'utf8')
  }

  update(mutator: (current: T) => T): T {
    const current = this.read()
    const next = mutator(current)
    this.write(next)
    return next
  }
}
