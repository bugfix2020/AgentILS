/**
 * Breadcrumb shape captured by every instrument and stored in-memory.
 *
 * Keep this stable — adapters / panels / transports all observe this contract.
 */
export interface Breadcrumb {
    /** ISO timestamp set at capture time. */
    timestamp: string
    /** Coarse category, e.g. `"fetch"`, `"console"`, `"xhr"`. */
    category: string
    /** Free-form short message for human + LLM consumption. */
    message: string
    /** Severity hint; `"info"` by default. */
    level?: 'debug' | 'info' | 'warning' | 'error'
    /** Arbitrary structured payload. Adapters should NOT put PII here. */
    data?: Record<string, unknown>
}

/** Listener fired when a breadcrumb is added to the store. */
export type BreadcrumbListener = (crumb: Breadcrumb) => void
