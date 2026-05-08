import { fill } from '../core/fill.js'
import type { Breadcrumb } from '../core/types.js'

/**
 * Wrap `globalThis.fetch` so each request emits a breadcrumb.
 *
 * Captures method, URL (origin + pathname only — query string is dropped here
 * to keep the redactor's job smaller), status, and duration. Errors are
 * captured as level=error breadcrumbs and re-thrown.
 *
 * Returns true if the install succeeded (or was already installed); false
 * if no `fetch` is available (Node <18 with no polyfill) or the property
 * is locked.
 */
export function instrumentFetch(emit: (crumb: Breadcrumb) => void, scope: typeof globalThis = globalThis): boolean {
    return fill(scope as unknown as Record<string, unknown>, 'fetch', (originalFetch) => {
        const original = originalFetch as typeof fetch
        return async function patchedFetch(this: unknown, ...args: Parameters<typeof fetch>) {
            const startedAt = Date.now()
            const input = args[0]
            const method =
                args[1]?.method ??
                (typeof input === 'object' && input !== null && 'method' in input
                    ? (input as { method?: string }).method
                    : undefined) ??
                'GET'
            const rawUrl =
                typeof input === 'string'
                    ? input
                    : input instanceof URL
                      ? input.href
                      : typeof input === 'object' && input !== null && 'url' in input
                        ? (input as { url: string }).url
                        : ''
            const url = stripQuery(rawUrl)
            try {
                const res = (await original.apply(this, args)) as Response
                emit({
                    timestamp: new Date(startedAt).toISOString(),
                    category: 'fetch',
                    message: `${method.toUpperCase()} ${url} ${res.status}`,
                    level: res.ok ? 'info' : 'warning',
                    data: {
                        method: method.toUpperCase(),
                        url,
                        status: res.status,
                        durationMs: Date.now() - startedAt,
                    },
                })
                return res
            } catch (err) {
                emit({
                    timestamp: new Date(startedAt).toISOString(),
                    category: 'fetch',
                    message: `${method.toUpperCase()} ${url} ERROR`,
                    level: 'error',
                    data: {
                        method: method.toUpperCase(),
                        url,
                        durationMs: Date.now() - startedAt,
                        error: err instanceof Error ? err.message : String(err),
                    },
                })
                throw err
            }
        } as unknown as (...a: unknown[]) => unknown
    })
}

function stripQuery(raw: string): string {
    if (!raw) return ''
    const q = raw.indexOf('?')
    return q === -1 ? raw : raw.slice(0, q)
}
