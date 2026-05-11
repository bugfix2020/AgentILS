import { applyPatch } from './applyPatch'
import type { WorkflowDefinition, WorkflowNode, WorkflowRunOptions, WorkflowRunResult } from './types'

export function createWorkflow<TContext, TNode extends WorkflowNode<TContext>>(
    definition: WorkflowDefinition<TContext, TNode>,
) {
    return {
        definition,

        async run(options: WorkflowRunOptions<TContext>): Promise<WorkflowRunResult<TContext>> {
            let context = options.initialContext
            const controller = new AbortController()

            let onAbort: (() => void) | null = null
            if (options.signal) {
                onAbort = () => controller.abort()
                options.signal.addEventListener('abort', onAbort)
            }

            const hook = options.hook ?? {}

            try {
                for (let i = 0; i < definition.nodes.length; i++) {
                    const node = definition.nodes[i]

                    if (controller.signal.aborted) {
                        return {
                            status: 'stopped',
                            context,
                            reason: 'aborted',
                        }
                    }

                    const beforeMeta = hook.before?.(node.id, context)

                    const result = await node.run(context)

                    context = applyPatch(context, result.patch)

                    hook.after?.(node.id, context, result, beforeMeta)

                    if (result.type === 'stop') {
                        return {
                            status: 'stopped',
                            context,
                            reason: result.reason,
                        }
                    }
                }

                return {
                    status: 'done',
                    context,
                }
            } catch (error) {
                return {
                    status: 'failed',
                    context,
                    error,
                }
            } finally {
                if (onAbort && options.signal) {
                    options.signal.removeEventListener('abort', onAbort)
                }
            }
        },
    }
}
