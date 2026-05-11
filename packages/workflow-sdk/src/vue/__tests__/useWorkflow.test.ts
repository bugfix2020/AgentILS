import { describe, it, expect } from 'vitest'
import { useWorkflow } from '../useWorkflow'
import { defineNode, defineWorkflow } from '../../core'

describe('useWorkflow', () => {
    it('should initialize with idle status', () => {
        const { status } = useWorkflow({
            definition: defineWorkflow({
                id: 'test',
                nodes: [],
            }),
        })

        expect(status).toBe('idle')
    })

    it('should update status to done when workflow completes', async () => {
        const workflow = useWorkflow({
            definition: defineWorkflow({
                id: 'test',
                nodes: [
                    defineNode({
                        id: 'step1',
                        run: async () => ({ type: 'continue' }),
                    }),
                ],
            }),
        })

        await workflow.start({})

        expect(workflow.status).toBe('done')
    })

    it('should handle workflow execution in Vue reactivity system', async () => {
        const workflowInstance = useWorkflow({
            definition: defineWorkflow({
                id: 'test',
                nodes: [
                    defineNode({
                        id: 'step1',
                        run: async (ctx: { value: number }) => {
                            await new Promise((resolve) => setTimeout(resolve, 10))
                            return { type: 'continue', patch: { value: ctx.value + 1 } }
                        },
                    }),
                ],
            }),
        })

        expect(workflowInstance.status).toBe('idle')

        await workflowInstance.start({ value: 1 })
        expect(workflowInstance.status).toBe('done')
    })
})
