import { createOverrideState, isHardOverride, isOverrideActive, summarizeOverride, type CreateOverrideStateInput, type OverrideState } from '../control/override-policy.js'
import type { AgentGateMemoryStore } from '../store/memory-store.js'

export interface OverrideSurfaceState {
  state: OverrideState | null
  active: boolean
  hard: boolean
  summary: string
}

export interface OverrideServiceApi {
  createOverrideState(input: CreateOverrideStateInput): OverrideState
  resolveRunId(preferredRunId?: string | null): string | null
  getCurrentOverrideState(preferredRunId?: string | null): OverrideState | null
  isOverrideActive(overrideState?: OverrideState | null): boolean
  isHardOverride(overrideState?: OverrideState | null): boolean
  summarizeOverride(overrideState?: OverrideState | null): string
  buildOverrideSurface(preferredRunId?: string | null): OverrideSurfaceState
}

export class OverrideService implements OverrideServiceApi {
  constructor(private readonly store: AgentGateMemoryStore) {}

  createOverrideState(input: CreateOverrideStateInput): OverrideState {
    return createOverrideState(input)
  }

  resolveRunId(preferredRunId?: string | null): string | null {
    return this.store.resolveRunId(preferredRunId)
  }

  getCurrentOverrideState(preferredRunId?: string | null): OverrideState | null {
    const runId = this.resolveRunId(preferredRunId)
    if (!runId) {
      return null
    }

    try {
      return this.store.getCurrentOverrideState(runId)
    } catch {
      return null
    }
  }

  isOverrideActive(overrideState?: OverrideState | null): boolean {
    return isOverrideActive(overrideState)
  }

  isHardOverride(overrideState?: OverrideState | null): boolean {
    return isHardOverride(overrideState)
  }

  summarizeOverride(overrideState?: OverrideState | null): string {
    return summarizeOverride(overrideState)
  }

  buildOverrideSurface(preferredRunId?: string | null): OverrideSurfaceState {
    const state = this.getCurrentOverrideState(preferredRunId)
    return {
      state,
      active: this.isOverrideActive(state),
      hard: this.isHardOverride(state),
      summary: this.summarizeOverride(state),
    }
  }
}

