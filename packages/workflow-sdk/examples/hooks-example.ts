/* eslint-disable no-console */
import { defineNode, defineWorkflow, createWorkflow } from '../src/core'

const logNode = defineNode<{ message: string; step: number }>({
    id: 'log',
    run: async (ctx) => {
        console.log(`Step ${ctx.step}: ${ctx.message}`)

        return {
            type: 'continue',
            patch: {
                step: ctx.step + 1,
            },
        }
    },
})

const countNode = defineNode<{ step: number }>({
    id: 'count',
    run: async (ctx) => {
        console.log(`Counted: ${ctx.step * 2}`)

        return {
            type: 'continue',
            patch: {
                total: ctx.step * 2,
            },
        }
    },
})

const hookWorkflow = defineWorkflow({
    id: 'hook-example',
    nodes: [logNode, countNode],
})

const workflowWithHooks = createWorkflow(hookWorkflow)

export { workflowWithHooks, logNode, countNode }

export async function runWithHooks() {
    console.log('=== Hook Example ===')

    const result = await workflowWithHooks.run({
        initialContext: { message: 'Starting workflow', step: 1 },
        hook: {
            before: (nodeId, ctx) => {
                console.log(`[${nodeId}] Before:`, ctx)
                return { startTime: Date.now() }
            },
            after: (nodeId, ctx, signal, meta) => {
                const duration = Date.now() - meta.startTime
                console.log(`[${nodeId}] After (${duration}ms):`, signal)
            },
        },
    })

    console.log('Final result:', result)
    return result
}
