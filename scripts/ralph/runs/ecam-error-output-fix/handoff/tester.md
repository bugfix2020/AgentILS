# Tester Handoff

## Story

- id: US-001
- title: ECAM pre-commit panel: show actual error output instead of AP DISCONNECT

## Verification Summary

All acceptance criteria verified against the diff and build output.

1. **"AP DISCONNECT" removed**: The hardcoded string in `stepRow()` (line 164) is replaced with `${errorTail(step)}`. No occurrences remain in production source (`panel.tsx`). Residual occurrences in `preview/error.yml` are test fixtures, not rendered by the panel.
2. **errorTail edge cases verified by code inspection**:
    - Empty/undefined tail: `!step.tail` guard returns `"FAILED"`.
    - Empty string tail: passes through ANSI strip, line split/filter yields empty array, falls back to `"FAILED"`.
    - Single-line tail: returned as-is if length <= 30.
    - Multi-line tail: `split('\n').filter(non-empty).slice(-1)` extracts last meaningful line.
    - Long lines: truncated to 30 visible chars with unicode ellipsis (`\u2026`).
    - ANSI escapes: stripped via module-level `ANSI_RE` regex (same pattern used in `runner.tsx`).
3. **Panel layout preserved**: `stepRow()` still renders step label, status indicator, and duration/count on the right. The `right` variable is only populated for `failed` status (now with error tail) or `running`/`passed` with count/total.
4. **Typecheck passes**: `pnpm --filter @agent-ils/quality-gate exec tsc --noEmit` exited cleanly (no errors).
5. **Build passes**: `pnpm --filter @agent-ils/quality-gate build` succeeded in 115ms, producing `dist/precommit.js` (17.12 KB).
6. **Changeset exists**: `.changeset/ecam-error-output-fix.md` declares `patch` for `@agent-ils/quality-gate` with a clear description.

## Commands Run

- `git diff --stat` -- 1 file changed, 22 insertions, 1 deletion
- `git diff` -- reviewed full diff of `panel.tsx`
- `pnpm --filter @agent-ils/quality-gate exec tsc --noEmit` -- PASS
- `pnpm --filter @agent-ils/quality-gate build` -- PASS
- `grep -r "AP DISCONNECT" packages/quality-gate` -- only in `preview/error.yml` (fixture), not in production source

## Result

PASS

## Failure Reason

N/A

## Required Fixes

N/A

## Notes for Next

- The fix is entirely in `packages/quality-gate/src/precommit/panel.tsx`: new `ANSI_RE` constant, `ERR_TAIL_MAX = 30` constant, and `errorTail(step)` helper function.
- `errorTail` returns "FAILED" as the fallback when tail is empty/undefined/all-blank -- this replaces the old "AP DISCONNECT" placeholder with a meaningful default.
- The 30-char truncation limit is conservative by design (ECAM panel is single-line-per-step, no scrolling).
- The dry-run fail step (`DRY_RUN_FAIL_STEPS` in `steps.ts`) emits `"[FAILED] dry step"` which will now appear as the error tail instead of "AP DISCONNECT" -- useful for manual verification.
- Beta subagent should verify the panel renders correctly in a real dry-run scenario.
