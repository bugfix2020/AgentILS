export const AGENTILS_INTERACTION_TIMEOUT_MSEC = 2_147_483_647

const longRunningLocalToolNames = new Set([
  'approval_request',
  'feedback_gate',
  'ui_task_start_gate',
])

export function getLocalToolRequestOptions(toolName: string) {
  if (!longRunningLocalToolNames.has(toolName)) {
    return undefined
  }

  return {
    timeout: AGENTILS_INTERACTION_TIMEOUT_MSEC,
  }
}
