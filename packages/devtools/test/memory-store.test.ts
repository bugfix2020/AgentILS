/**
 * MemoryStore reverse-case tests.
 *
 * Covers:
 *   1. Illegal input — capacity 0 / negative / non-integer throws TypeError.
 *   2. Boundary — single-slot capacity, fill, overflow drops oldest.
 *   3. State — clear() resets size; snapshot is a copy (mutation safe).
 *   4. Concurrent — listener throws must not block other listeners or capture.
 *   5. Dependency — onAdd unsubscribe stops further notifications.
 */
import { strict as assert } from 'node:assert'
import test from 'node:test'

import type { Breadcrumb } from '../src/core/types.js'
import { MemoryStore } from '../src/storage/memory.js'

const crumb = (msg: string): Breadcrumb => ({
    timestamp: '2026-05-08T00:00:00.000Z',
    category: 'test',
    message: msg,
})

test('MemoryStore: rejects non-positive / non-integer capacity', () => {
    assert.throws(() => new MemoryStore(0), TypeError)
    assert.throws(() => new MemoryStore(-1), TypeError)
    assert.throws(() => new MemoryStore(1.5), TypeError)
    assert.throws(() => new MemoryStore(Number.NaN), TypeError)
})

test('MemoryStore: capacity=1 keeps only the latest', () => {
    const s = new MemoryStore(1)
    s.add(crumb('a'))
    s.add(crumb('b'))
    assert.equal(s.size(), 1)
    assert.equal(s.snapshot()[0]?.message, 'b')
})

test('MemoryStore: snapshot is a copy', () => {
    const s = new MemoryStore(5)
    s.add(crumb('x'))
    const snap = s.snapshot()
    snap.push(crumb('mutation'))
    assert.equal(s.size(), 1, 'internal buffer must not be affected by snapshot mutation')
})

test('MemoryStore: clear resets size', () => {
    const s = new MemoryStore(5)
    s.add(crumb('x'))
    s.add(crumb('y'))
    s.clear()
    assert.equal(s.size(), 0)
    assert.deepEqual(s.snapshot(), [])
})

test('MemoryStore: throwing listener does not block others or capture', () => {
    const s = new MemoryStore(5)
    const seen: string[] = []
    s.onAdd(() => {
        throw new Error('bad listener')
    })
    s.onAdd((c) => seen.push(c.message))
    s.add(crumb('hello'))
    assert.equal(s.size(), 1)
    assert.deepEqual(seen, ['hello'])
})

test('MemoryStore: onAdd returns an unsubscribe', () => {
    const s = new MemoryStore(5)
    const seen: string[] = []
    const off = s.onAdd((c) => seen.push(c.message))
    s.add(crumb('a'))
    off()
    s.add(crumb('b'))
    assert.deepEqual(seen, ['a'])
})
