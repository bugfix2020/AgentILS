import { AgentGateOrchestrator } from '../orchestrator/orchestrator.js'

export interface InteractionLoopResult {
  runId: string
  currentStep: string
  currentStatus: string
}

export async function advanceInteractionLoop(
  orchestrator: AgentGateOrchestrator,
  runId: string,
): Promise<InteractionLoopResult> {
  const run = orchestrator.store.requireRun(runId)
  return {
    runId,
    currentStep: run.currentStep,
    currentStatus: run.currentStatus,
  }
}
