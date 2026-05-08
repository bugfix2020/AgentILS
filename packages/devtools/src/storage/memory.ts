import type { Breadcrumb, BreadcrumbListener } from '../core/types.js'

/**
 * Bounded in-memory breadcrumb buffer. Drops oldest on overflow.
 *
 * Why an LRU-by-insertion-order array and not a real LRU map:
 * breadcrumbs are append-only; access never reorders. A ring on top of a plain
 * array keeps the read path O(n) for export-all (the only hot read) without
 * paying for a Map / linked-list.
 */
export class MemoryStore {
    private readonly buf: Breadcrumb[] = []
    private readonly listeners = new Set<BreadcrumbListener>()

    constructor(private readonly capacity = 200) {
        if (!Number.isInteger(capacity) || capacity <= 0) {
            throw new TypeError(`MemoryStore capacity must be a positive integer, got ${String(capacity)}`)
        }
    }

    add(crumb: Breadcrumb): void {
        this.buf.push(crumb)
        if (this.buf.length > this.capacity) this.buf.shift()
        for (const fn of this.listeners) {
            try {
                fn(crumb)
            } catch {
                // listener errors must not block capture — swallow per devtools contract
            }
        }
    }

    /** Returns a copy so callers cannot mutate internal state. */
    snapshot(): Breadcrumb[] {
        return this.buf.slice()
    }

    clear(): void {
        this.buf.length = 0
    }

    size(): number {
        return this.buf.length
    }

    onAdd(listener: BreadcrumbListener): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }
}
