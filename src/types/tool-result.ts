// src/types/tool-result.ts

export type ToolResultCode =
  | 'OK'
  | 'PENDING_USER_INPUT'
  | 'USER_DECLINED'
  | 'USER_CANCELLED'
  | 'PERMISSION_DENIED'
  | 'BUDGET_EXCEEDED'
  | 'TOOL_ERROR'

export type ToolResult<T = unknown> = {
  ok: boolean
  code: ToolResultCode
  message: string
  data?: T
}
