import type { Breadcrumb } from '../core/types.js'
import { downloadJsonl } from '../transport/download.js'

/**
 * Minimal floating panel: bottom-right pill showing breadcrumb count, with
 * "Download" + "Clear" buttons. Intentionally vanilla DOM — no framework
 * dependency, no Shadow DOM (defer that to PR-A real panel).
 *
 * MVP scope: prove the wiring works. Styling is inline & ugly on purpose so
 * nobody mistakes this for the real panel.
 */
export interface PanelHandle {
    update(count: number): void
    destroy(): void
}

export interface MountPanelOptions {
    getCrumbs: () => Breadcrumb[]
    clear: () => void
}

export function mountPanel(opts: MountPanelOptions): PanelHandle | null {
    if (typeof document === 'undefined' || !document.body) return null

    const root = document.createElement('div')
    root.setAttribute('data-agentils-devtools-panel', '')
    Object.assign(root.style, {
        position: 'fixed',
        right: '12px',
        bottom: '12px',
        zIndex: '2147483647',
        padding: '6px 10px',
        background: '#111',
        color: '#eee',
        font: '12px/1.4 system-ui, sans-serif',
        borderRadius: '6px',
        boxShadow: '0 2px 8px rgba(0,0,0,.3)',
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
    } satisfies Partial<CSSStyleDeclaration>)

    const label = document.createElement('span')
    label.textContent = 'devtools: 0'
    root.appendChild(label)

    const dlBtn = makeBtn('⬇')
    dlBtn.title = 'Download JSONL'
    dlBtn.addEventListener('click', () => {
        void downloadJsonl(opts.getCrumbs())
    })
    root.appendChild(dlBtn)

    const clearBtn = makeBtn('✕')
    clearBtn.title = 'Clear'
    clearBtn.addEventListener('click', () => {
        opts.clear()
    })
    root.appendChild(clearBtn)

    document.body.appendChild(root)

    return {
        update(count) {
            label.textContent = `devtools: ${count}`
        },
        destroy() {
            root.remove()
        },
    }
}

function makeBtn(text: string): HTMLButtonElement {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = text
    Object.assign(b.style, {
        background: '#333',
        color: '#eee',
        border: '1px solid #555',
        borderRadius: '4px',
        padding: '2px 6px',
        cursor: 'pointer',
        font: 'inherit',
    } satisfies Partial<CSSStyleDeclaration>)
    return b
}
