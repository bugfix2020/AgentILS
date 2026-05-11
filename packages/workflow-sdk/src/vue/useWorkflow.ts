import { ref } from 'vue'
import { createWorkflow } from '../core'
import type { WorkflowNode, WorkflowRunResult, NodeState } from '../core'
import type { UseWorkflowOptions, UseWorkflowReturn } from './types'

export function useWorkflow<TContext, TNode extends WorkflowNode<TContext>>(
    options: UseWorkflowOptions<TContext, TNode>,
): UseWorkflowReturn<TContext> {
    const workflow = createWorkflow(options.definition)
    const status = ref<'idle' | 'running' | 'done' | 'stopped' | 'failed'>('idle')
    const nodeStates = ref<Record<string, NodeState>>({})
    const currentNodeIndex = ref(-1)
    const abortRef = ref<AbortController | null>(null)
    const nodeIds = options.definition.nodes.map((n) => n.id)

    const start = async (initialContext: TContext): Promise<WorkflowRunResult<TContext>> => {
        const controller = new AbortController()
        abortRef.value = controller

        // Reset all nodes to pending
        const initial: Record<string, NodeState> = {}
        for (const id of nodeIds) {
            initial[id] = 'pending'
        }
        nodeStates.value = initial
        currentNodeIndex.value = -1
        status.value = 'running'

        let idx = 0

        const result: WorkflowRunResult<TContext> = await workflow.run({
            initialContext,
            signal: controller.signal,
            hook: {
                before: (nodeId) => {
                    currentNodeIndex.value = idx
                    nodeStates.value = { ...nodeStates.value, [nodeId]: 'running' }
                },
                after: (nodeId, _ctx, signal) => {
                    const state: NodeState = signal.type === 'stop' ? 'error' : 'done'
                    const next = { ...nodeStates.value, [nodeId]: state }
                    // Mark remaining nodes as skipped when stopped
                    if (state === 'error') {
                        for (let i = idx + 1; i < nodeIds.length; i++) {
                            next[nodeIds[i]] = 'skipped'
                        }
                    }
                    nodeStates.value = next
                    idx++
                },
            },
        })

        status.value = result.status
        return result
    }

    const abort = () => {
        abortRef.value?.abort()
    }

    return {
        get status() {
            return status.value
        },
        start,
        abort,
        get currentNodeIndex() {
            return currentNodeIndex.value
        },
        get nodeStates() {
            return nodeStates.value
        },
    }
}
