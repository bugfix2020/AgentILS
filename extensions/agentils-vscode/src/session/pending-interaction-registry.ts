import * as vscode from 'vscode'
import type { AgentILSPendingInteraction } from '../model'

interface PendingInteractionRecord<TResult> {
  interaction: AgentILSPendingInteraction
  resolve: (result: TResult) => void
}

export class PendingInteractionRegistry implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<AgentILSPendingInteraction | null>()
  private current: PendingInteractionRecord<unknown> | null = null

  readonly onDidChange = this.emitter.event

  snapshot(): AgentILSPendingInteraction | null {
    return this.current?.interaction ?? null
  }

  begin<TResult>(interaction: AgentILSPendingInteraction): Promise<TResult> {
    if (this.current) {
      throw new Error('AgentILS already has a pending interaction waiting for user input.')
    }

    return new Promise<TResult>((resolve) => {
      this.current = {
        interaction,
        resolve: resolve as (result: unknown) => void,
      }
      this.emitter.fire(interaction)
    })
  }

  resolve<TResult>(requestId: string, result: TResult) {
    if (!this.current || this.current.interaction.requestId !== requestId) {
      throw new Error('Pending AgentILS interaction was not found for resolution.')
    }

    const pending = this.current
    this.current = null
    this.emitter.fire(null)
    pending.resolve(result)
  }

  dispose() {
    this.current = null
    this.emitter.dispose()
  }
}
