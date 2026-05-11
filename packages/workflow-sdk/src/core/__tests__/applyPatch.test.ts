import { describe, it, expect } from 'vitest'
import { applyPatch } from '../applyPatch'

describe('applyPatch', () => {
    it('should return original context if no patch', () => {
        const context = { a: 1, b: 2 }
        const result = applyPatch(context)
        expect(result).toBe(context)
    })

    it('should merge patch into context', () => {
        const context = { a: 1, b: 2 }
        const patch = { b: 3, c: 4 }
        const result = applyPatch(context, patch)

        expect(result).toEqual({ a: 1, b: 3, c: 4 })
        expect(result).not.toBe(context)
    })

    it('should handle empty patch', () => {
        const context = { a: 1 }
        const patch = {}
        const result = applyPatch(context, patch)

        expect(result).toEqual({ a: 1 })
    })

    it('should handle null/undefined values in patch', () => {
        const context = { a: 1, b: 2, c: 3 }
        const patch = { b: null, c: undefined }
        const result = applyPatch(context, patch)

        expect(result).toEqual({ a: 1, b: null, c: undefined })
    })
})
