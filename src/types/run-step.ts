// src/types/run-step.ts

export type RunStepType = 'llm' | 'tool' | 'elicitation' | 'approval' | 'system'

export type RunStepStatus = 'started' | 'completed' | 'failed' | 'cancelled'

export type RunStep = {
  id: string
  runId: string
  type: RunStepType
  name: string
  status: RunStepStatus
  request?: unknown
  response?: unknown
  startedAt: string
  endedAt?: string
}
