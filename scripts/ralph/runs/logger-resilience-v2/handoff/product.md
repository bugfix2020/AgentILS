# Product Handoff

## Story

- id: US-001
- title: Logger collector resilience: background health probe, auto-start, gitignore

## Goal

Review the implemented changes that refactor the browser logger's health check from a synchronous per-call probe to a background polling mechanism, add an `open` option for auto-starting the collector in Node, and auto-create `.gitignore` in log directories.

## Acceptance Criteria

1. **browser.ts — synchronous readiness gate**: `log()` checks `collectorReady` flag only; when false, returns `{ ok: true, status: 204 }` with zero fetch calls. Verified at line 231.
2. **browser.ts — background probe**: `setInterval` polls `GET /api/health` every 10 seconds (`HEALTH_PROBE_INTERVAL_MS`). Probe runs in `startBackgroundProbe()`, called via `ensureCollector()`. Verified at lines 120-131.
3. **browser.ts — `open` option**: `BrowserLoggerOptions.open?: boolean` added (line 26). When true, background probing starts immediately at creation time (lines 289-295) and `spawnCollector()` is called (line 206).
4. **browser.ts — Node auto-spawn**: `spawnCollector()` uses dynamic `import('node:child_process')` (line 186) — no static Node import. Binary located via PATH scan then `~/.agent-ils/bin/` cache. Logs warning if not found. Verified at lines 182-199.
5. **browser.ts — failure recovery**: `markUnready()` sets `collectorReady = false` on fetch error (lines 133-136, called at lines 257 and 264). Background probe continues running, so the logger self-heals on next interval tick.
6. **index.ts — .gitignore**: `startHttpLogServer` creates `.gitignore` with `*\n` using `writeFile(..., { flag: 'wx' })` — exclusive create, won't overwrite existing file. Verified at lines 207-209.
7. **server.go — .gitignore**: `Start()` uses `os.Stat` + `os.IsNotExist` guard before `os.WriteFile`. Verified at lines 60-65.
8. **logger.instructions.md**: Documented `open` option behavior, background probing, `.gitignore` auto-creation, and child logger state sharing.
9. **Typecheck**: Not yet verified (needs `pnpm --filter @agent-ils/logger typecheck`).
10. **Build**: Not yet verified (needs `pnpm --filter @agent-ils/logger build`).
11. **Go build**: Not yet verified (needs `go build` in logger-collector).

## Non-goals

- No changes to the query module (`src/query.ts`).
- No changes to CLI behavior (`src/cli.ts`).
- No changes to the Node-side `createLogger` / `createHttpLogger` APIs.
- No production logging sink integration (pino/winston/datadog).

## Edge Cases

- **`open=true` in browser (non-Node)**: `spawnCollector()` is guarded by `isNode` check (line 183), returns early. Only background probing activates. Correct behavior.
- **Multiple `createBrowserLogger` calls with `open=true`**: Each creates its own probe interval and could spawn multiple collectors. `collectorSpawned` flag (line 183) prevents duplicate spawns per logger instance, but different instances would each spawn. Acceptable for now — the binary does its own port-bind guard.
- **`child()` logger sharing**: Child loggers created via `child()` share `collectorReady`, `probeInterval`, and `probeStarted` via closure. This is correct — all children should agree on collector state.
- **Race between `log()` and first probe**: Before the first probe completes, `collectorReady` is `false`, so `log()` returns 204 silently. This is the intended graceful degradation.
- **`.gitignore` already exists**: Both Node and Go implementations handle this gracefully (Node: `wx` flag catches EEXIST; Go: `os.Stat` check).

## Suggested Files / Surfaces

- `packages/logger/src/browser.ts` — primary change
- `packages/logger/src/index.ts` — .gitignore addition
- `packages/logger-collector/internal/server/server.go` — .gitignore addition
- `docs/instructions/logger.instructions.md` — doc sync
- `packages/logger/dist/browser.d.ts` — generated type declarations (verify after build)

## Notes for Developer

- This is a **review run**. All changes are already implemented in the codebase.
- The developer stage should run `typecheck`, `build` (Node + Go), and inspect the built `.d.ts` to confirm `open?: boolean` is exported.
- No test files exist for `browser.ts`. Consider whether a unit test for the probe/readiness logic is warranted as a follow-up (not blocking for this review).
- The `HEALTH_PROBE_INTERVAL_MS = 10_000` and `HEALTH_TIMEOUT_MS = 2_000` constants are hardcoded. This is fine for the current scope but may need configuration if the collector endpoint is remote in the future.
