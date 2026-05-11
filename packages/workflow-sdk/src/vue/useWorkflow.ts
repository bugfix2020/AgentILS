import { ref } from 'vue'
import { createWorkflow } from '../core'
import type { WorkflowNode, WorkflowRunResult } from '../core'
import type { UseWorkflowOptions, UseWorkflowReturn } from './types'

export function useWorkflow<TContext, TNode extends WorkflowNode<TContext>>(
    options: UseWorkflowOptions<TContext, TNode>,
): UseWorkflowReturn<TContext> {
    const workflow = createWorkflow(options.definition)
    const status = ref<'idle' | 'running' | 'done' | 'stopped' | 'failed'>('idle')
    const abortRef = ref<AbortController | null>(null)

    const start = async (initialContext: TContext): Promise<WorkflowRunResult<TContext>> => {
        const controller = new AbortController()
        abortRef.value = controller
        status.value = 'running'

        const result: WorkflowRunResult<TContext> = await workflow.run({
            initialContext,
            signal: controller.signal,
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
    }
}
