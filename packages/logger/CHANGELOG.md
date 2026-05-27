# @agent-ils/logger

## 0.1.1

### Patch Changes

- 087d001: Fix ECAM panel border overflow when long values (e.g. deeply nested logDir paths) exceed IW=60. The Go binary's banner package now uses `visLen` for ANSI-aware length calculation and `padOrTruncate` / `truncateVisible` to enforce exact panel width, matching the quality-gate ECAM panel behavior.

## 0.1.0

### Minor Changes

- 4b1741e: Add `overrideKey` option and collector health check to browser logger
    - **overrideKey**: when configured and matching `window.$agentILS.logger.overrideKey`, force-enable logging even with `enabled: false`. Safe in SSR environments (no-ops when `window` is unavailable).
    - **Collector readiness probe**: before sending logs, the SDK probes `GET /api/health`. If the collector is not running, logs are silently discarded (no 404 errors). Health is retried every 10s on failure; readiness is reset on delivery error and re-probed automatically.
    - Declare `Window.$agentILS` global type in browser entry.
