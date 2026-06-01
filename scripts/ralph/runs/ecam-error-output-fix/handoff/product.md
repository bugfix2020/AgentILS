# Product Handoff

## Story

- id: US-001
- title: ECAM pre-commit panel: show actual error output instead of AP DISCONNECT

## Goal

When a pre-commit step fails, the ECAM panel should display the tail of the subprocess output so the developer can see what went wrong without re-running the command manually. Currently the panel shows the hardcoded string "AP DISCONNECT" which is a placeholder with zero diagnostic value.

## Acceptance Criteria

1. When a pre-commit step fails, the ECAM panel shows the last few lines of subprocess stderr/stdout (from `StepState.tail`).
2. The actual error message (e.g., "on protected branch main", lint errors, typecheck failures) is visible in the panel.
3. The hardcoded "AP DISCONNECT" text is removed.
4. The panel still shows the step label, status indicator, and duration.
5. Typecheck passes for packages/quality-gate.
6. Build passes for packages/quality-gate.

## Non-goals

- Changing the runner logic or how output is captured (already correct in `runStep`).
- Adding multi-line output rows to the panel (the ECAM panel is single-line-per-step; the tail should be summarized to fit).
- Changing the A320 ECAM visual theme or layout.
- Adding scrolling or pagination for long output.

## Edge Cases

- **Empty tail**: If `step.tail` is undefined or empty, fall back to a generic "FAILED" label (not "AP DISCONNECT").
- **Very long tail lines**: The tail buffer is 4 KiB. Trim to a reasonable visible width so the panel row does not overflow the 60-char inner width.
- **ANSI escape codes in output**: Subprocess output may contain ANSI escapes from tools like eslint. These should be stripped before display.
- **Newlines in tail**: The tail may contain multiple lines. Display only the last meaningful non-empty line.

## Suggested Files / Surfaces

- `packages/quality-gate/src/precommit/panel.tsx` -- the `stepRow` function, line 142-143: replace `AP DISCONNECT` with tail extraction logic.

No other files need changes. The `StepState.tail` field is already populated by `runStep()` in `steps.ts` and passed through `runner.tsx`.

## Notes for Developer

The fix is entirely in `panel.tsx`, function `stepRow`. The key line is:

```
right = `${C.amb}AP DISCONNECT${C.rst}`
```

Replace with logic that:

1. Takes `step.tail` (which contains the last 4 KiB of combined stdout/stderr).
2. Strips ANSI escapes (there is already an `ANSI_RE` pattern in `runner.tsx`; consider adding one locally or importing).
3. Splits on newlines, filters empty lines, takes the last line.
4. Truncates to fit the available width on the right side of the row (roughly 20-25 visible chars).
5. Falls back to `"FAILED"` if tail is empty/undefined.

Consider adding a small helper function like `errorTail(step: StepState): string` that encapsulates this logic and keeps `stepRow` clean.
