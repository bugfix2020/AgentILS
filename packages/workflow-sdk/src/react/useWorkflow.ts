import { useState, useRef } from 'react'
import { createWorkflow } from '../core'
import type { WorkflowNode, WorkflowRunResult } from '../core'
import type { UseWorkflowOptions, UseWorkflowReturn } from './types'

export function useWorkflow<TContext, TNode extends WorkflowNode<TContext>>(
    options: UseWorkflowOptions<TContext, TNode>,
): UseWorkflowReturn<TContext> {
    const workflow = createWorkflow(options.definition)
    const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'stopped' | 'failed'>('idle')
    const abortRef = useRef<AbortController | null>(null)

    const start = async (initialContext: TContext): Promise<WorkflowRunResult<TContext>> => {
        abortRef.current = new AbortController()
        setStatus('running')

        const result: WorkflowRunResult<TContext> = await workflow.run({
            initialContext,
            signal: abortRef.current.signal,
        })

        setStatus(result.status)
        return result
    }

    const abort = () => {
        abortRef.current?.abort()
    }

    return {
        status,
        start,
        abort,
    }
}
