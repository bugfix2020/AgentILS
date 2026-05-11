import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWorkflow } from '../useWorkflow'
import { defineNode, defineWorkflow } from '../../core'

describe('useWorkflow', () => {
    it('should initialize with idle status', () => {
        const { result } = renderHook(() =>
            useWorkflow({
                definition: defineWorkflow({
                    id: 'test',
                    nodes: [],
                }),
            }),
        )

        expect(result.current.status).toBe('idle')
    })

    it('should update status to running when started', async () => {
        const { result } = renderHook(() =>
            useWorkflow({
                definition: defineWorkflow({
                    id: 'test',
                    nodes: [
                        defineNode({
                            id: 'step1',
                            run: async () => ({ type: 'continue' }),
                        }),
                    ],
                }),
            }),
        )

        await act(async () => {
            await result.current.start({})
        })

        expect(result.current.status).toBe('done')
    })

    it('should abort workflow when abort is called', async () => {
        const slowNode = defineNode({
            id: 'slow',
            run: async () => {
                await new Promise((resolve) => setTimeout(resolve, 200))
                return { type: 'continue' }
            },
        })

        const { result } = renderHook(() =>
            useWorkflow({
                definition: defineWorkflow({
                    id: 'test',
                    nodes: [slowNode],
                }),
            }),
        )

        const promise = result.current.start({})

        setTimeout(() => {
            act(() => {
                result.current.abort()
            })
        }, 50)

        await act(async () => {
            await promise
        })

        expect(result.current.status).toBe('stopped')
    })
})
