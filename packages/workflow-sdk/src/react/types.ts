import type { WorkflowDefinition, WorkflowNode, WorkflowRunResult, NodeState } from '../core'

export interface UseWorkflowOptions<TContext, TNode extends WorkflowNode<TContext>> {
    definition: WorkflowDefinition<TContext, TNode>
}

export interface UseWorkflowReturn<TContext> {
    status: 'idle' | 'running' | 'done' | 'stopped' | 'failed'
    start: (initialContext: TContext) => Promise<WorkflowRunResult<TContext>>
    abort: () => void
    /** -1 when idle; index of the currently executing node otherwise */
    currentNodeIndex: number
    /** Per-node status keyed by node id */
    nodeStates: Record<string, NodeState>
}
