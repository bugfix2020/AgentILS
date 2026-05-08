import { isFilled } from './core/fill.js'
import type { Breadcrumb } from './core/types.js'
import { instrumentFetch } from './instrument/fetch.js'
import { mountPanel, type PanelHandle } from './panel/stub.js'
import { MemoryStore } from './storage/memory.js'
import { consoleTransport } from './transport/console.js'
import { downloadJsonl } from './transport/download.js'

export type { Breadcrumb, BreadcrumbListener } from './core/types.js'
export { fill, isFilled } from './core/fill.js'
export { MemoryStore } from './storage/memory.js'
export { instrumentFetch } from './instrument/fetch.js'
export { consoleTransport } from './transport/console.js'
export { downloadJsonl } from './transport/download.js'
export { mountPanel } from './panel/stub.js'

export interface InitOptions {
    /** Max breadcrumbs kept in memory. Default 200. */
    capacity?: number
    /** Wire up `fetch` instrumentation. Default true. */
    instrumentFetch?: boolean
    /** Mirror every breadcrumb to `console.debug`. Default false. */
    consoleMirror?: boolean
    /** Mount the floating dev panel (browser only). Default false. */
    panel?: boolean
}

export interface DevtoolsHandle {
    store: MemoryStore
    panel: PanelHandle | null
    /** Export the current breadcrumb buffer as JSONL via the browser. */
    download(): Promise<boolean>
    /** Detach the panel; instrumented globals stay patched (idempotent fill). */
    destroy(): void
}

/**
 * One-shot bootstrap. Wires the chosen instruments to a fresh MemoryStore,
 * optionally mirrors to console, optionally mounts the panel.
 *
 * Designed so that calling `init()` twice is *almost* idempotent: the
 * `fill()` calls are idempotent by tag, but the resulting handles are
 * independent (each gets its own store). Hosts that hot-reload should
 * call `destroy()` first.
 */
export function init(options: InitOptions = {}): DevtoolsHandle {
    const store = new MemoryStore(options.capacity ?? 200)
    const emit = (c: Breadcrumb): void => store.add(c)

    if (options.instrumentFetch !== false) instrumentFetch(emit)

    let unsubscribe: (() => void) | null = null
    if (options.consoleMirror) {
        const sink = consoleTransport()
        unsubscribe = store.onAdd(sink)
    }

    let panel: PanelHandle | null = null
    if (options.panel) {
        panel = mountPanel({ getCrumbs: () => store.snapshot(), clear: () => store.clear() })
        if (panel) {
            const stop = store.onAdd(() => panel?.update(store.size()))
            const prevUnsub = unsubscribe
            unsubscribe = () => {
                stop()
                prevUnsub?.()
            }
        }
    }

    return {
        store,
        panel,
        download: () => downloadJsonl(store.snapshot()),
        destroy() {
            unsubscribe?.()
            panel?.destroy()
        },
    }
}

// Convenience for tests + adapters.
export const __internal = { isFilled }
