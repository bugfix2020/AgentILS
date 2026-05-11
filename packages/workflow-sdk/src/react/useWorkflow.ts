import { useState, useRef } from 'react'
import { createWorkflow } from '../core'
import type { WorkflowNode, WorkflowRunResult, NodeState } from '../core'
import type { UseWorkflowOptions, UseWorkflowReturn } from './types'

export function useWorkflow<TContext, TNode extends WorkflowNode<TContext>>(
    options: UseWorkflowOptions<TContext, TNode>,
): UseWorkflowReturn<TContext> {
    const workflow = createWorkflow(options.definition)
    const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'stopped' | 'failed'>('idle')
    const [nodeStates, setNodeStates] = useState<Record<string, NodeState>>({})
    const [currentNodeIndex, setCurrentNodeIndex] = useState(-1)
    const abortRef = useRef<AbortController | null>(null)
    const nodeIdsRef = useRef(options.definition.nodes.map((n) => n.id))

    const start = async (initialContext: TContext): Promise<WorkflowRunResult<TContext>> => {
        abortRef.current = new AbortController()

        // Reset all nodes to pending
        const initial: Record<string, NodeState> = {}
        for (const id of nodeIdsRef.current) {
            initial[id] = 'pending'
        }
        setNodeStates(initial)
        setCurrentNodeIndex(-1)
        setStatus('running')

        let idx = 0

        const result: WorkflowRunResult<TContext> = await workflow.run({
            initialContext,
            signal: abortRef.current.signal,
            hook: {
                before: (nodeId) => {
                    setCurrentNodeIndex(idx)
                    setNodeStates((prev) => ({ ...prev, [nodeId]: 'running' }))
                },
                after: (nodeId, _ctx, signal) => {
                    const state: NodeState = signal.type === 'stop' ? 'error' : 'done'
                    setNodeStates((prev) => {
                        const next = { ...prev, [nodeId]: state }
                        // Mark remaining nodes as skipped when stopped
                        if (state === 'error') {
                            for (let i = idx + 1; i < nodeIdsRef.current.length; i++) {
                                next[nodeIdsRef.current[i]] = 'skipped'
                            }
                        }
                        return next
                    })
                    idx++
                },
            },
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
        currentNodeIndex,
        nodeStates,
    }
}
