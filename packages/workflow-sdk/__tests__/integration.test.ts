import { describe, it, expect } from 'vitest'
import { createWorkflow, defineNode, defineWorkflow } from '../src/core'

describe('Workflow Integration Tests', () => {
    it('should handle complex workflow with multiple nodes', async () => {
        const nodes = [
            defineNode<{ data: string; step: number }>({
                id: 'parse',
                run: (ctx) => {
                    return {
                        type: 'continue',
                        patch: { step: 1, parsed: JSON.parse(ctx.data) },
                    }
                },
            }),
            defineNode<{ step: number; parsed: Record<string, unknown> }>({
                id: 'validate',
                run: (ctx) => {
                    if (!ctx.parsed.value) {
                        return {
                            type: 'stop',
                            reason: 'Invalid data',
                            patch: { error: 'Missing value field' },
                        }
                    }
                    return {
                        type: 'continue',
                        patch: { step: 2, valid: true },
                    }
                },
            }),
            defineNode<{ step: number; valid: boolean }>({
                id: 'process',
                run: (ctx) => {
                    return {
                        type: 'continue',
                        patch: { step: 3, result: `Processed: ${ctx.valid}` },
                    }
                },
            }),
        ]

        const workflow = createWorkflow(defineWorkflow({ id: 'complex-workflow', nodes }))

        const result = await workflow.run({
            initialContext: { data: '{"value": "test"}' },
        })

        expect(result.status).toBe('done')
        expect(result.context).toEqual({
            data: '{"value": "test"}',
            step: 3,
            parsed: { value: 'test' },
            valid: true,
            result: 'Processed: true',
        })
    })

    it('should support context transformation across nodes', async () => {
        const workflow = createWorkflow(
            defineWorkflow({
                id: 'transform-workflow',
                nodes: [
                    defineNode<{ input: string }>({
                        id: 'uppercase',
                        run: (ctx) => ({
                            type: 'continue',
                            patch: { step1: ctx.input.toUpperCase() },
                        }),
                    }),
                    defineNode<{ step1: string }>({
                        id: 'reverse',
                        run: (ctx) => ({
                            type: 'continue',
                            patch: { step2: ctx.step1.split('').reverse().join('') },
                        }),
                    }),
                    defineNode<{ step1: string; step2: string }>({
                        id: 'combine',
                        run: (ctx) => ({
                            type: 'continue',
                            patch: {
                                final: `${ctx.step1} -> ${ctx.step2}`,
                                transformations: [ctx.step1, ctx.step2],
                            },
                        }),
                    }),
                ],
            }),
        )

        const result = await workflow.run({
            initialContext: { input: 'hello' },
        })

        expect(result.status).toBe('done')
        expect(result.context).toEqual({
            input: 'hello',
            step1: 'HELLO',
            step2: 'OLLEH',
            final: 'HELLO -> OLLEH',
            transformations: ['HELLO', 'OLLEH'],
        })
    })

    it('should handle workflow with conditional stop', async () => {
        const workflow = createWorkflow(
            defineWorkflow({
                id: 'conditional-workflow',
                nodes: [
                    defineNode<{ count: number }>({
                        id: 'check',
                        run: (ctx) => {
                            if (ctx.count < 0) {
                                return {
                                    type: 'stop',
                                    reason: 'Negative count not allowed',
                                    patch: { error: 'Count must be positive' },
                                }
                            }
                            return { type: 'continue' }
                        },
                    }),
                    defineNode<{ count: number }>({
                        id: 'double',
                        run: (ctx) => ({
                            type: 'continue',
                            patch: { doubled: ctx.count * 2 },
                        }),
                    }),
                ],
            }),
        )

        const result1 = await workflow.run({
            initialContext: { count: 5 },
        })

        expect(result1.status).toBe('done')
        expect(result1.context.doubled).toBe(10)

        const result2 = await workflow.run({
            initialContext: { count: -1 },
        })

        expect(result2.status).toBe('stopped')
        expect(result2.context.error).toBe('Count must be positive')
    })

    it('should collect execution data via hooks', async () => {
        const executionLog: Array<Record<string, unknown>> = []

        const workflow = createWorkflow(
            defineWorkflow({
                id: 'hook-workflow',
                nodes: [
                    defineNode<{ value: number }>({
                        id: 'multiply',
                        run: (ctx) => ({
                            type: 'continue',
                            patch: { value: ctx.value * 2 },
                        }),
                    }),
                    defineNode<{ value: number }>({
                        id: 'add',
                        run: (ctx) => ({
                            type: 'continue',
                            patch: { value: ctx.value + 10 },
                        }),
                    }),
                ],
            }),
        )

        await workflow.run({
            initialContext: { value: 5 },
            hook: {
                before: (nodeId, ctx) => {
                    executionLog.push({ type: 'before', nodeId, context: ctx })
                },
                after: (nodeId, ctx, result) => {
                    executionLog.push({ type: 'after', nodeId, context: ctx, result })
                },
            },
        })

        expect(executionLog).toHaveLength(4)
        expect(executionLog[0]).toEqual({
            type: 'before',
            nodeId: 'multiply',
            context: { value: 5 },
        })
        expect(executionLog[1]).toEqual({
            type: 'after',
            nodeId: 'multiply',
            context: { value: 10 },
            result: { type: 'continue' },
        })
        expect(executionLog[2]).toEqual({
            type: 'before',
            nodeId: 'add',
            context: { value: 10 },
        })
        expect(executionLog[3]).toEqual({
            type: 'after',
            nodeId: 'add',
            context: { value: 20 },
            result: { type: 'continue' },
        })
    })
})
