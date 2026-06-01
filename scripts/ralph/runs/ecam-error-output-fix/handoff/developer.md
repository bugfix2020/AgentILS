# Developer Handoff

## Story

- id: US-001
- title: ECAM pre-commit panel: show actual error output instead of AP DISCONNECT

## Files Changed

- `packages/quality-gate/src/precommit/panel.tsx` -- replaced hardcoded "AP DISCONNECT" with `errorTail()` helper that extracts the last meaningful line from `step.tail`

## Implementation Summary

1. Added module-level `ANSI_RE` constant (same pattern already used in `runner.tsx`).
2. Added `ERR_TAIL_MAX = 30` constant for maximum visible width of the error tail.
3. Added `errorTail(step: StepState): string` helper:
    - Returns "FAILED" if `step.tail` is undefined or empty after stripping ANSI and filtering blank lines.
    - Strips ANSI escape codes from the tail buffer.
    - Splits on newlines, filters empty lines, takes the last non-empty line.
    - Truncates to 30 visible characters with a unicode ellipsis (`\u2026`) if longer.
4. In `stepRow()`, replaced `right = \`${C.amb}AP DISCONNECT${C.rst}\``with`right = \`${C.amb}${errorTail(step)}${C.rst}\``.

No other files changed. The `StepState.tail` field is already populated by `runStep()` in `steps.ts` and passed through `runner.tsx`.

## Commands Run

- `pnpm --filter @agent-ils/quality-gate exec tsc --noEmit` -- passed
- `pnpm --filter @agent-ils/quality-gate build` -- passed

## Known Risks

- If a subprocess emits only ANSI-colored output with no printable text after stripping, `errorTail` returns "FAILED". This is acceptable since it is the same fallback used for empty tails.
- The 30-char truncation limit is conservative; longer error messages will be clipped. This is by design (ECAM panel is single-line-per-step, no scrolling).

## Notes for Next

- Changeset created at `.changeset/ecam-error-output-fix.md` (patch level for `@agent-ils/quality-gate`).
- The dry-run fail step (`DRY_RUN_FAIL_STEPS` in `steps.ts`) emits `"[FAILED] dry step"` which will now appear as the error tail instead of "AP DISCONNECT".
- To manually verify: run `pnpm --filter @agent-ils/quality-gate dry-run:fail` and confirm the failed step row shows actual error text.
