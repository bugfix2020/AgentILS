// src/types/agent-run.ts

export type AgentRunStatus =
  | 'created'
  | 'running'
  | 'waiting_user'
  | 'blocked'
  | 'budget_exceeded'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type RunBudget = {
  maxLlmSteps: number
  maxToolCalls: number
  maxUserResumes: number
  maxTokens: number
  maxWallClockMs: number
}

export type RunUsage = {
  llmSteps: number
  toolCalls: number
  userResumes: number
  promptTokens: number
  completionTokens: number
}

export type AgentRun = {
  id: string
  sessionId: string
  userId?: string
  workspaceId?: string
  entryPrompt: string
  selectedModel: string
  selectedAgent?: string
  selectedPromptFile?: string
  status: AgentRunStatus
  budget: RunBudget
  usage: RunUsage
  // Guard to enforce feedback collection before complete_run.
  feedbackCollected: boolean
  interactionMode: 'mcp' | 'hc'
  feedbackRounds: number
  samplingUsed: boolean
  startedAt: string
  endedAt?: string
}
