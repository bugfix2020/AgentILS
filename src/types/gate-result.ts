// src/types/gate-result.ts

import type { AgentRun } from './agent-run.js'

export type GateResult =
  | { type: 'ALLOW'; run: AgentRun }
  | { type: 'REQUIRE_LOGIN' }
  | { type: 'EMAIL_NOT_ALLOWED' }
  | { type: 'QUOTA_EXCEEDED' }
  | { type: 'PLAN_RESTRICTED' }
  | { type: 'SERVER_DISABLED' }
