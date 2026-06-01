# Tester Handoff

## Story

- id: US-001
- title: Logger collector resilience: background health probe, auto-start, gitignore

## Verification Summary

All 11 acceptance criteria verified against source code and build output. Typecheck, ESM/CJS/DTS build, and Go build all pass cleanly. No issues found.

### Criterion-by-criterion

| #   | Criterion                                                      | Status | Evidence                                                                                                                     |
| --- | -------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | `ensureReady` only checks `collectorReady` flag, no sync probe | PASS   | browser.ts:231 — synchronous `if (!collectorReady)` check, returns `{ ok: true, status: 204 }` before any fetch              |
| 2   | Background probe runs on 10s setInterval                       | PASS   | browser.ts:120-131 — `startBackgroundProbe` calls immediate probe then `setInterval(..., HEALTH_PROBE_INTERVAL_MS)` (10s)    |
| 3   | Unready log() returns ok:true 204 with zero fetch              | PASS   | browser.ts:231 — early return before payload construction and fetch                                                          |
| 4   | `BrowserLoggerOptions.open?: boolean` exists                   | PASS   | browser.ts:26-27 — `open?: boolean` with JSDoc                                                                               |
| 5   | `open=true` starts probing immediately + spawns collector      | PASS   | browser.ts:289-295 — calls `ensureCollector()` at creation time, which starts probe and spawns collector                     |
| 6   | `startHttpLogServer` creates `.gitignore` with `*`             | PASS   | index.ts:207-209 — `writeFile(..., { flag: 'wx' })` with EEXIST catch                                                        |
| 7   | Go `Start()` creates `.gitignore` in log dir                   | PASS   | server.go:60-65 — `os.Stat` + `os.IsNotExist` guard then `os.WriteFile`                                                      |
| 8   | `logger.instructions.md` updated                               | PASS   | docs/instructions/logger.instructions.md:82-101 — documents open option, background probing, .gitignore, child state sharing |
| 9   | Typecheck passes                                               | PASS   | `pnpm --filter @agent-ils/logger typecheck` — no errors                                                                      |
| 10  | Build passes                                                   | PASS   | ESM + CJS + DTS all build successfully                                                                                       |
| 11  | Go build passes                                                | PASS   | `go build ./...` from logger-collector — exit 0                                                                              |

### State machine verification

- **ensureCollector** (line 201): idempotent via `probeStarted` guard
- **spawnCollector** (line 182): idempotent via `collectorSpawned` + `isNode` guards
- **startBackgroundProbe** (line 120): idempotent via `if (probeInterval) return`
- **markUnready** (line 133): resets `collectorReady = false`, probe continues running for self-healing
- **open=true path** (line 289): triggers `ensureCollector` at construction, before any log() call

### Dynamic import pattern

- `browser.ts` uses `await import('node:child_process')`, `await import('node:fs')`, `await import('node:os')`, `await import('node:path')` — all guarded by `isNode` check (line 95)
- Dynamic imports work correctly in both ESM (.js) and CJS (.cjs) outputs
- No static `node:*` imports in browser.ts, preserving browser compatibility

### Generated output verification

- `dist/browser.d.ts` line 24: `open?: boolean;` with JSDoc correctly exported
- `dist/browser.d.cts` line 24: same, CJS-compatible type declaration

## Commands Run

| Command                                     | Result                               |
| ------------------------------------------- | ------------------------------------ |
| `pnpm --filter @agent-ils/logger typecheck` | PASS                                 |
| `pnpm --filter @agent-ils/logger build`     | PASS (ESM 9ms + CJS 9ms + DTS 855ms) |
| `go build ./...` (logger-collector)         | PASS (exit 0)                        |

## Result

PASS

## Failure Reason

(none)

## Required Fixes

(none)

## Notes for Next

- All 11 acceptance criteria verified and passing.
- The `open` option is the primary new public API surface. It enables zero-config collector startup in Node environments via dynamic import.
- Background health probe runs independently of log() calls, enabling self-healing: if the collector goes down, `markUnready()` is called; the probe will restore readiness when the collector comes back.
- No unit tests exist for the probe/readiness lifecycle — this is a known gap flagged by the developer. Consider adding tests as a follow-up.
- Ready for beta stage.
