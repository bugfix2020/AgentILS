import type { WorkflowNode } from './types'

export function defineNode<TContext, TConfig = unknown>(node: WorkflowNode<TContext, TConfig>) {
    return node
}
