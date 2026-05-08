import type { Breadcrumb } from '../core/types.js'

/**
 * Print every breadcrumb to the developer console with a stable prefix.
 *
 * `console.debug` is used so production builds with default log levels stay
 * quiet; flip the dev panel filter to "verbose" in DevTools to see them.
 */
export function consoleTransport(prefix = '[agentils-devtools]'): (crumb: Breadcrumb) => void {
    return (crumb) => {
        try {
            // eslint-disable-next-line no-console
            console.debug(prefix, crumb.category, crumb.message, crumb.data ?? {})
        } catch {
            // never let transport failure break the host app
        }
    }
}
