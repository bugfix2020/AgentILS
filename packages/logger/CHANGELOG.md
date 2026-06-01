# @agent-ils/logger

## 0.2.0

### Minor Changes

- e10159d: Add `open` option to `createBrowserLogger` for zero-config collector startup. Health probe now runs in background `setInterval` instead of synchronous per-call fetch. Log directory auto-creates `.gitignore` to prevent accidental commits.

## 0.1.2

### Patch Changes

- Fix the npm wrapper so package-manager shims under `node_modules/.bin` are not
  treated as native `agent-ils-logger` binaries. This prevents `npx
@agent-ils/logger serve` from recursively spawning itself. The wrapper now also
  downloads native binaries from the package tag format
  `@agent-ils/logger@<version>`.

## 0.1.1

### Patch Changes

- 087d001: Fix ECAM panel border overflow when long values (e.g. deeply nested logDir paths) exceed IW=60. The Go binary's banner package now uses `visLen` for ANSI-aware length calculation and `padOrTruncate` / `truncateVisible` to enforce exact panel width, matching the quality-gate ECAM panel behavior.

## 0.1.0

### Minor Changes

- 4b1741e: Add `overrideKey` option and collector health check to browser logger
    - **overrideKey**: when configured and matching `window.$agentILS.logger.overrideKey`, force-enable logging even with `enabled: false`. Safe in SSR environments (no-ops when `window` is unavailable).
    - **Collector readiness probe**: before sending logs, the SDK probes `GET /api/health`. If the collector is not running, logs are silently discarded (no 404 errors). Health is retried every 10s on failure; readiness is reset on delivery error and re-probed automatically.
    - Declare `Window.$agentILS` global type in browser entry.
