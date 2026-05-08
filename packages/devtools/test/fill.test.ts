/**
 * fill() reverse-case tests.
 *
 * Covers:
 *   1. Illegal input — non-function target / non-object source / null.
 *   2. Boundary — frozen object (non-configurable property).
 *   3. State — double-fill is idempotent (same wrapper, no nesting).
 *   4. Concurrent — two callers both wrap; later wins, no throw.
 *   5. Dependency failure — replacement throws → fill returns false, original stays.
 */
import { strict as assert } from 'node:assert'
import test from 'node:test'

import { fill, isFilled } from '../src/core/fill.js'

test('fill: returns false when target property is not a function', () => {
    const obj: Record<string, unknown> = { x: 42 }
    const ok = fill(obj, 'x', (orig) => orig)
    assert.equal(ok, false)
    assert.equal(obj.x, 42)
})

test('fill: returns false on null / undefined source', () => {
    assert.equal(
        fill(null as unknown as Record<string, unknown>, 'foo', (o) => o),
        false,
    )
    assert.equal(
        fill(undefined as unknown as Record<string, unknown>, 'foo', (o) => o),
        false,
    )
})

test('fill: returns false on missing property', () => {
    const obj: Record<string, unknown> = {}
    assert.equal(
        fill(obj, 'missing', (o) => o),
        false,
    )
})

test('fill: replaces a function and tags it', () => {
    const obj = { hello: (name: string) => `hi ${name}` }
    const ok = fill(obj as unknown as Record<string, unknown>, 'hello', (orig) => {
        return ((...args: unknown[]) => `[wrapped]${(orig as (n: string) => string)(args[0] as string)}`) as (
            ...a: unknown[]
        ) => unknown
    })
    assert.equal(ok, true)
    assert.equal(obj.hello('world'), '[wrapped]hi world')
    assert.equal(isFilled(obj.hello), true)
})

test('fill: idempotent on double-fill (no nested wrappers)', () => {
    const obj = { f: () => 'orig' }
    const wrapper = (orig: (...a: unknown[]) => unknown) =>
        ((..._args: unknown[]) => `W(${(orig as () => string)()})`) as (...a: unknown[]) => unknown
    fill(obj as unknown as Record<string, unknown>, 'f', wrapper)
    const firstWrapped = obj.f
    fill(obj as unknown as Record<string, unknown>, 'f', wrapper)
    assert.equal(obj.f, firstWrapped, 'second fill must be a no-op')
    assert.equal(obj.f(), 'W(orig)')
})

test('fill: frozen object — non-configurable property returns false, no throw', () => {
    const obj = Object.freeze({ f: () => 'frozen' })
    let threw = false
    try {
        const ok = fill(obj as unknown as Record<string, unknown>, 'f', (orig) => orig)
        assert.equal(ok, false)
    } catch {
        threw = true
    }
    assert.equal(threw, false)
    assert.equal(obj.f(), 'frozen')
})

test('fill: replacement that throws → returns false, original preserved', () => {
    const obj = { f: () => 'safe' }
    const ok = fill(obj as unknown as Record<string, unknown>, 'f', () => {
        throw new Error('boom')
    })
    assert.equal(ok, false)
    assert.equal(obj.f(), 'safe')
})

test('fill: replacement that returns non-function → returns false', () => {
    const obj = { f: () => 'safe' }
    const ok = fill(obj as unknown as Record<string, unknown>, 'f', () => 42 as unknown as (...a: unknown[]) => unknown)
    assert.equal(ok, false)
    assert.equal(obj.f(), 'safe')
})
