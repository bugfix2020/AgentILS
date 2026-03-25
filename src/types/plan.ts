// src/types/plan.ts

export type Plan = {
  id: string
  name: string
  monthlyRunLimit: number
  maxLlmStepsPerRun: number
  maxToolCallsPerRun: number
  maxUserResumesPerRun: number
  maxTokensPerRun: number
  maxWallClockMsPerRun: number
  modelMultipliers: Record<string, number>
}
