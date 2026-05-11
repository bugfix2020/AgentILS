export type WorkflowId = string
export type WorkflowNodeId = string

export type WorkflowStatus = 'idle' | 'running' | 'done' | 'stopped' | 'failed'

export type WorkflowSignal<TContext> =
    | { type: 'continue'; patch?: Partial<TContext> }
    | { type: 'stop'; reason: string; patch?: Partial<TContext> }

export type WorkflowHook<TContext, TEventMeta = unknown> = {
    before?: (nodeId: WorkflowNodeId, context: TContext) => TEventMeta
    after?: (nodeId: WorkflowNodeId, context: TContext, result: WorkflowSignal<TContext>, meta: TEventMeta) => void
}

export interface WorkflowNode<TContext, TConfig = unknown> {
    id: WorkflowNodeId
    name?: string
    config?: TConfig
    run: (context: TContext) => Promise<WorkflowSignal<TContext>>
}

export interface WorkflowDefinition<TContext, TNode extends WorkflowNode<TContext>> {
    id: WorkflowId
    nodes: TNode[]
}

export interface WorkflowRunOptions<TContext> {
    initialContext: TContext
    hook?: WorkflowHook<TContext, unknown>
    signal?: AbortSignal
}

export interface WorkflowRunResult<TContext> {
    status: Exclude<WorkflowStatus, 'idle' | 'running'>
    context: TContext
    reason?: string
    error?: unknown
}
