import type { WorkflowDefinition, WorkflowNode, WorkflowRunResult } from '../core'

export interface UseWorkflowOptions<TContext, TNode extends WorkflowNode<TContext>> {
    definition: WorkflowDefinition<TContext, TNode>
}

export interface UseWorkflowReturn<TContext> {
    status: 'idle' | 'running' | 'done' | 'stopped' | 'failed'
    start: (initialContext: TContext) => Promise<WorkflowRunResult<TContext>>
    abort: () => void
}
