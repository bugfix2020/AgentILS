// src/types/interaction-record.ts

export type InteractionRecord = {
  id: string
  runId: string
  round: number
  channel: 'mcp_elicit' | 'hc_webview'
  userInput: string
  llmResponse?: string
  samplingUsed: boolean
  timestamp: string
}
