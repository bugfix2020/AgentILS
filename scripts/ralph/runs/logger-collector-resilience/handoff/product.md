# Product Handoff

## Story

- id: US-001
- title: Logger collector resilience: background health probe, auto-start, gitignore

## Goal

Three improvements to `@agent-ils/logger`:

1. **Fix synchronous health probe on every log call** — When the collector is down, `browser.ts` currently calls `probeHealth()` (fetch GET /api/health) on every `log()` invocation. This causes CONNECTION_REFUSED errors on each call. The fix: `ensureReady` should only check the `collectorReady` boolean flag. Health probing should run exclusively in a background interval (10s), independent of log calls.

2. **Add `open` option to `createBrowserLogger`** — When `open: true`, start background health probing immediately on logger creation (don't wait for first log call). If running in Node environment, also spawn the Go collector binary as a child process (similar to `cli.ts` pattern).

3. **Auto-create `.gitignore` in log directory** — Both the Node SDK (`startHttpLogServer`) and Go collector should write a `.gitignore` with `*` pattern in the log directory after creating it, preventing log files from being committed.

## Acceptance Criteria

1. `browser.ts`: `ensureReady` only checks `collectorReady` flag, no synchronous `probeHealth` call
2. `browser.ts`: background health probe runs on a 10s interval via `setInterval`, independently of log calls
3. `browser.ts`: when collector is unready, `log()` returns `{ ok: true, status: 204 }` immediately with zero fetch calls
4. `browser.ts`: when `postLog` fails, `markUnready` sets `collectorReady=false`, background probe continues
5. `browser.ts`: `BrowserLoggerOptions` gains `open?: boolean` option
6. `browser.ts`: when `open=true`, background probing starts immediately on logger creation
7. `browser.ts`: when `open=true` and in Node env, spawn Go collector binary via `import('node:child_process')`
8. `index.ts`: `startHttpLogServer` creates `.gitignore` with `*` in log directory after `mkdir`
9. Go `server.go`: create `.gitignore` in log directory on startup
10. `logger.instructions.md` updated to reflect new behavior
11. Typecheck passes for `packages/logger`

## Non-goals

- No log buffering/caching (logs are still dropped when collector is unready)
- No changes to the Node HTTP logger (`createHttpLogger`) — it's fire-and-forget by design
- No changes to consumer packages (mcp, cli, vscode-ext)
- No changes to query.ts
- No remote forwarding or authentication

## Edge Cases

- `open=true` in browser environment: `open` is a no-op (can't spawn processes), but background probing still starts early
- `open=true` but binary not found: log warning to console, don't throw, background probing continues
- Multiple `createBrowserLogger` calls with `open=true`: should not spawn multiple collectors (check port first via health probe)
- `child()` loggers share background probe state via closure (existing pattern)
- SSR environments: `typeof process` check must be safe

## Suggested Files / Surfaces

- `packages/logger/src/browser.ts` — main changes (state machine, open option)
- `packages/logger/src/index.ts` — .gitignore creation in `startHttpLogServer`
- `packages/logger-collector/internal/server/server.go` — .gitignore creation on startup
- `docs/instructions/logger.instructions.md` — documentation updates

## Notes for Developer

- The anti-pattern "在 `src/browser.ts` 里 `import` 任何 `node:*`" still applies to static imports. Use dynamic `import('node:child_process')` guarded by env detection.
- Binary resolution follows `cli.ts` pattern: PATH scan → `~/.agent-ils/bin/agent-ils-logger-<platform>`
- The background probe should use `setInterval` (not recursive setTimeout) for cleaner lifecycle
- `clearInterval` should be called when the logger is done (if a cleanup mechanism exists)
- The Go collector's `.gitignore` should use `os.MkdirAll` + `os.WriteFile` pattern
