import { test, expect } from 'vitest'
import { createWorkflow, defineNode, defineWorkflow } from './src/core'

test('basic workflow execution', async () => {
    const nodes = [
        defineNode<{ count: number }>({
            id: 'step1',
            run: (ctx) => {
                expect(ctx).toEqual({ count: 1 })
                return { type: 'continue', patch: { count: ctx.count + 1 } }
            },
        }),
        defineNode<{ count: number }>({
            id: 'step2',
            run: (ctx) => {
                expect(ctx).toEqual({ count: 2 })
                return { type: 'continue' }
            },
        }),
    ]

    const workflow = createWorkflow(defineWorkflow({ id: 'test', nodes }))

    const result = await workflow.run({
        initialContext: { count: 1 },
    })

    expect(result.status).toBe('done')
    expect(result.context).toEqual({ count: 2 })
})

test('workflow stop signal', async () => {
    const stopNode = defineNode<{ count: number }>({
        id: 'stop',
        run: (_ctx) => {
            return { type: 'stop', reason: 'test stop', patch: { count: 99 } }
        },
    })

    const workflow = createWorkflow(defineWorkflow({ id: 'test', nodes: [stopNode] }))

    const result = await workflow.run({
        initialContext: { count: 1 },
    })

    expect(result.status).toBe('stopped')
    expect(result.context).toEqual({ count: 99 })
    expect(result.reason).toBe('test stop')
})

test('workflow error handling', async () => {
    const errorNode = defineNode<{ count: number }>({
        id: 'error',
        run: () => {
            throw new Error('test error')
        },
    })

    const workflow = createWorkflow(defineWorkflow({ id: 'test', nodes: [errorNode] }))

    const result = await workflow.run({
        initialContext: { count: 1 },
    })

    expect(result.status).toBe('failed')
    expect(result.error).toEqual(new Error('test error'))
})
