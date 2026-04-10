export * from './conversation-service.js'
export * from './task-service.js'
export * from './summary-service.js'
export * from './override-service.js'

import { ConversationService } from './conversation-service.js'
import { OverrideService } from './override-service.js'
import { SummaryService } from './summary-service.js'
import { TaskService } from './task-service.js'
import type { AgentGateMemoryStore } from '../store/memory-store.js'

export interface ControlPlaneServices {
  conversation: ConversationService
  task: TaskService
  summary: SummaryService
  override: OverrideService
}

export interface CreateControlPlaneServicesInput {
  store: AgentGateMemoryStore
}

export function createControlPlaneServices(input: CreateControlPlaneServicesInput): ControlPlaneServices {
  return {
    conversation: new ConversationService(input.store),
    task: new TaskService(input.store),
    summary: new SummaryService(input.store),
    override: new OverrideService(input.store),
  }
}
