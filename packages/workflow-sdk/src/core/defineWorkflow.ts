import type { WorkflowDefinition, WorkflowNode } from './types'

export function defineWorkflow<TContext, TNode extends WorkflowNode<TContext>>(
    definition: WorkflowDefinition<TContext, TNode>,
) {
    return definition
}
