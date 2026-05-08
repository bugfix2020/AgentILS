/**
 * instrumentFetch reverse-case tests.
 *
 * We use a fake `globalThis`-shaped scope so the test never touches the real
 * Node fetch.
 *
 * Covers:
 *   1. Illegal input — scope without fetch returns false (no throw).
 *   2. Boundary — string URL with query string is recorded with query stripped.
 *   3. State — double-instrument is idempotent (only one wrapper).
 *   4. Concurrent — many parallel calls each emit one breadcrumb.
 *   5. Dependency — underlying fetch rejects → error breadcrumb + rethrow.
 */
import { strict as assert } from 'node:assert'
import test from 'node:test'

import type { Breadcrumb } from '../src/core/types.js'
import { isFilled } from '../src/core/fill.js'
import { instrumentFetch } from '../src/instrument/fetch.js'

type Scope = { fetch?: (...args: unknown[]) => unknown }

function makeScope(impl: (input: unknown, init?: unknown) => Promise<unknown>): Scope {
    return { fetch: impl as unknown as (...a: unknown[]) => unknown }
}

test('instrumentFetch: scope with no fetch → returns false, no throw', () => {
    const scope = {} as unknown as typeof globalThis
    const ok = instrumentFetch(() => {}, scope)
    assert.equal(ok, false)
})

test('instrumentFetch: strips query string from URL', async () => {
    const seen: Breadcrumb[] = []
    const scope = makeScope(
        async () => ({ status: 200, ok: true }) as unknown as Response,
    ) as unknown as typeof globalThis
    const ok = instrumentFetch((c) => seen.push(c), scope)
    assert.equal(ok, true)
    await (scope as unknown as { fetch: typeof fetch }).fetch('https://example.com/api?token=secret&x=1')
    assert.equal(seen.length, 1)
    assert.equal(seen[0]?.data?.url, 'https://example.com/api')
    assert.equal(seen[0]?.level, 'info')
})

test('instrumentFetch: double-instrument is idempotent', () => {
    const scope = makeScope(
        async () => ({ status: 200, ok: true }) as unknown as Response,
    ) as unknown as typeof globalThis
    instrumentFetch(() => {}, scope)
    const first = (scope as unknown as { fetch: unknown }).fetch
    instrumentFetch(() => {}, scope)
    const second = (scope as unknown as { fetch: unknown }).fetch
    assert.equal(first, second)
    assert.equal(isFilled(second), true)
})

test('instrumentFetch: parallel calls each emit one breadcrumb', async () => {
    const seen: Breadcrumb[] = []
    const scope = makeScope(
        async () => ({ status: 200, ok: true }) as unknown as Response,
    ) as unknown as typeof globalThis
    instrumentFetch((c) => seen.push(c), scope)
    const f = (scope as unknown as { fetch: typeof fetch }).fetch
    await Promise.all([f('https://a.test/1'), f('https://a.test/2'), f('https://a.test/3')])
    assert.equal(seen.length, 3)
})

test('instrumentFetch: underlying rejection → error breadcrumb + rethrow', async () => {
    const seen: Breadcrumb[] = []
    const scope = makeScope(async () => {
        throw new Error('network down')
    }) as unknown as typeof globalThis
    instrumentFetch((c) => seen.push(c), scope)
    let caught: unknown
    try {
        await (scope as unknown as { fetch: typeof fetch }).fetch('https://x.test/y')
    } catch (e) {
        caught = e
    }
    assert.equal(caught instanceof Error, true)
    assert.equal((caught as Error).message, 'network down')
    assert.equal(seen.length, 1)
    assert.equal(seen[0]?.level, 'error')
    assert.equal(seen[0]?.data?.error, 'network down')
})

test('instrumentFetch: non-2xx response is captured as warning', async () => {
    const seen: Breadcrumb[] = []
    const scope = makeScope(
        async () => ({ status: 500, ok: false }) as unknown as Response,
    ) as unknown as typeof globalThis
    instrumentFetch((c) => seen.push(c), scope)
    await (scope as unknown as { fetch: typeof fetch }).fetch('https://x.test/y')
    assert.equal(seen[0]?.level, 'warning')
    assert.equal(seen[0]?.data?.status, 500)
})
