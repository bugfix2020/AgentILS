export interface McpChannelMessage {
  runId: string
  type: string
  detail?: Record<string, unknown>
}

export class McpInteractionChannel {
  publish(message: McpChannelMessage): McpChannelMessage {
    return message
  }
}
