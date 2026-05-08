/**
 * Sentry-style monkey-patcher.
 *
 * Replaces `source[name]` with `replacement(original)`, while keeping a
 * reference to the original so that double-fill is idempotent — calling
 * `fill()` twice with the same source/name returns the *same* wrapped function
 * instead of nesting wrappers (the common cause of duplicate breadcrumbs in
 * SPAs that hot-reload).
 *
 * Invariants:
 *   - if `source[name]` is not a function: `fill()` is a no-op and returns false
 *   - if the property is non-configurable / non-writable: returns false, no throw
 *   - the wrapped function is tagged with `__agentils_fill__: true`
 */
const FILL_TAG = '__agentils_fill__'

type Fn = (...args: unknown[]) => unknown

/**
 * Returns true if the property was successfully replaced (or was already
 * filled and a no-op was performed). Returns false on hard failure
 * (non-function target, non-configurable descriptor).
 */
export function fill(
    source: Record<string, unknown> | undefined | null,
    name: string,
    replacement: (original: Fn) => Fn,
): boolean {
    if (!source || typeof source !== 'object') return false
    const original = (source as Record<string, unknown>)[name]
    if (typeof original !== 'function') return false

    // Idempotency: if already filled, leave the existing wrapper in place.
    if ((original as { [FILL_TAG]?: boolean })[FILL_TAG] === true) return true

    let wrapped: Fn
    try {
        wrapped = replacement(original as Fn)
    } catch {
        return false
    }
    if (typeof wrapped !== 'function') return false

    // Mark and try to swap. Some props (e.g. console.log on hardened envs)
    // are non-configurable; in that case bail without throwing.
    try {
        Object.defineProperty(wrapped, FILL_TAG, { value: true, configurable: true })
        ;(source as Record<string, unknown>)[name] = wrapped
        return true
    } catch {
        return false
    }
}

/** For tests: detects whether a function was produced by `fill()`. */
export function isFilled(value: unknown): boolean {
    return typeof value === 'function' && (value as { [FILL_TAG]?: boolean })[FILL_TAG] === true
}
