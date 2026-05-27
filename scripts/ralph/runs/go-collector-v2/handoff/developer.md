# Developer Handoff: US-003 -- Node Thin-Shell Passthrough Invoker Marking

> Status: IMPLEMENTED, ready for tester
> Branch: feat/logger-go-collector

---

## What was implemented

Injected `AGENT_ILS_INVOKER: 'npx'` into the spawn call's env object in `packages/logger/src/cli.ts`. This is a single-line change that spreads `process.env` and adds the invoker marker so the Go child process (implemented in US-001) detects npx mode.

## Files changed

### Modified files

| File                         | Changes                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `packages/logger/src/cli.ts` | Line 194: `env: process.env` -> `env: { ...process.env, AGENT_ILS_INVOKER: 'npx' }` |

No new files created. No SDK files (browser.ts, index.ts, query.ts) modified.

## Verification results

1. **Build**: `pnpm --filter @agent-ils/logger build` -- PASS (all 4 entry points compiled: index, browser, cli, query; DTS generated)
2. **SDK files untouched**: `git diff --name-only` for browser.ts, index.ts, query.ts returns empty
3. **Only cli.ts changed** in the logger source directory

## Acceptance criteria mapping

| #   | AC                                                                            | Status |
| --- | ----------------------------------------------------------------------------- | ------ |
| 1   | cli.ts spawn call injects `env: { ...process.env, AGENT_ILS_INVOKER: 'npx' }` | PASS   |
| 2   | SDK layer (browser.ts, index.ts, query.ts) not modified                       | PASS   |
| 3   | `pnpm --filter @agent-ils/logger build` passes                                | PASS   |

## Gotchas for tester

- This change only affects the Node thin shell (`cli.ts`). The Go binary side was already implemented in US-001 (`detect.go` reads `AGENT_ILS_INVOKER` env var).
- To verify end-to-end, run the logger via `npx @agent-ils/logger` and confirm the ECAM info panel shows npx mode (no install hint line) and `--help` shows `npx @agent-ils/logger` in the Usage section.
- Running the Go binary directly (without the Node shell) will NOT have `AGENT_ILS_INVOKER` set, so it falls through to gorun/binary detection as before.
