import type { Breadcrumb } from '../core/types.js'

/**
 * Serialize breadcrumbs to JSONL and offer them as a download.
 *
 * Strategy:
 *   1. If `window.showSaveFilePicker` exists (Chromium with FS Access API +
 *      secure context): open the native save dialog, stream chunks. This
 *      sidesteps Blob memory ceilings on large captures.
 *   2. Otherwise fall back to a Blob anchor click. Sufficient for MVP /
 *      Firefox / Safari.
 *
 * Returns true if a download was initiated, false on cancel/unavailable.
 *
 * Note: this transport is *manually* invoked (e.g. from the panel's
 * "Download" button) — it does NOT subscribe to the store. Callers pass
 * the snapshot they want to export.
 */
export async function downloadJsonl(
    crumbs: Breadcrumb[],
    suggestedName = `agentils-devtools-${nowStamp()}.jsonl`,
): Promise<boolean> {
    const text = crumbs.map((c) => JSON.stringify(c)).join('\n') + (crumbs.length ? '\n' : '')

    // Tier 1: File System Access API.
    const fsa = (globalThis as unknown as { showSaveFilePicker?: ShowSaveFilePicker }).showSaveFilePicker
    if (typeof fsa === 'function') {
        try {
            const handle = await fsa({
                suggestedName,
                types: [{ description: 'JSON Lines', accept: { 'application/x-ndjson': ['.jsonl'] } }],
            })
            const writable = await handle.createWritable()
            await writable.write(text)
            await writable.close()
            return true
        } catch (err) {
            // User cancelled the save picker — surface as non-error false.
            if (err instanceof Error && err.name === 'AbortError') return false
            // Any other failure: fall through to Blob fallback.
        }
    }

    // Tier 2: Blob + anchor click.
    if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') {
        return false
    }
    const blob = new Blob([text], { type: 'application/x-ndjson' })
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = suggestedName
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Defer revoke so the browser has time to start the download.
    setTimeout(() => URL.revokeObjectURL(href), 1000)
    return true
}

function nowStamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-')
}

type ShowSaveFilePicker = (opts: {
    suggestedName?: string
    types?: { description?: string; accept: Record<string, string[]> }[]
}) => Promise<{
    createWritable(): Promise<{ write(data: string | BufferSource | Blob): Promise<void>; close(): Promise<void> }>
}>
