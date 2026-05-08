# @agent-ils/devtools

> Status: **MVP skeleton (private, browser-only).** Not published to npm.

Browser-side breadcrumb capture SDK for AgentILS. Sentry-style `fill()`
instrumentation, in-memory LRU store, console + JSONL download transports,
floating panel stub.

This package is the minimal verifiable cut of the design in
[`docs/agentils/plan-devtools-browser.md`](../../docs/agentils/plan-devtools-browser.md).
The full PR-A scope (real panel, IDB storage, redactor, adapters, activator)
is pending follow-up PRs.

## Quick start

```ts
import { init } from '@agent-ils/devtools'

const dt = init({
    capacity: 200,
    instrumentFetch: true,
    consoleMirror: false,
    panel: true,
})

// later, manually export:
await dt.download()
```

Or, for zero-config side-effect import:

```ts
import '@agent-ils/devtools/auto'
```

## What's in the box (v0.0.0)

| Layer      | Module                              | Notes                                                      |
| ---------- | ----------------------------------- | ---------------------------------------------------------- |
| core       | `src/core/fill.ts`, `core/types.ts` | Idempotent monkey-patch primitive + `Breadcrumb` shape.    |
| instrument | `src/instrument/fetch.ts`           | `globalThis.fetch` wrapper. Strips query string from URLs. |
| storage    | `src/storage/memory.ts`             | Bounded array (drop-oldest on overflow).                   |
| transport  | `src/transport/console.ts`          | `console.debug` mirror.                                    |
| transport  | `src/transport/download.ts`         | `showSaveFilePicker` → Blob anchor fallback.               |
| panel      | `src/panel/stub.ts`                 | Vanilla DOM floating pill, intentionally ugly.             |

## What's NOT in the box

- IDB / localStorage persistence (PR follow-up)
- PII redactor (PR follow-up)
- Adapter loader (Vue / React) (PR follow-up)
- 4-tier activator (PR follow-up)
- Browser extension panel (PR follow-up)

## Scripts

```bash
pnpm -F @agent-ils/devtools build
pnpm -F @agent-ils/devtools typecheck
pnpm -F @agent-ils/devtools test
```
