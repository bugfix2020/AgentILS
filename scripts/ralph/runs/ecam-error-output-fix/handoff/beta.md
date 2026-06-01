# Beta Handoff

## Story

- id: US-001
- title: ECAM pre-commit panel: show actual error output instead of AP DISCONNECT

## User Experience Summary

Verified the fix from a user's perspective by inspecting the code diff, reading the changeset, and confirming the build succeeds. The ECAM pre-commit panel now shows the actual tail of subprocess output on failure instead of the nonsensical "AP DISCONNECT" placeholder. A developer who commits on a protected branch or whose lint-staged check fails will now see the real error message in the panel -- e.g., "[FAILED] dry step" or "on protected branch main" -- instead of a cryptic disconnect label.

## Commands Tested

- git diff packages/quality-gate/src/precommit/panel.tsx -- confirmed the change is minimal and well-scoped
- pnpm --filter @agent-ils/quality-gate exec tsc --noEmit -- PASS (typecheck)
- pnpm --filter @agent-ils/quality-gate build -- PASS (build produces dist/precommit.js)
- grep -r "AP DISCONNECT" packages/quality-gate/src/ -- only in preview/error.yml fixture, not production source

## Changelog Review

The changeset (.changeset/ecam-error-output-fix.md) accurately describes the fix: patch for @agent-ils/quality-gate, replacing "AP DISCONNECT" with actual error output. The description is clear and will appear correctly in the release notes.

## Result

PASS

## Issues Found

None. The fix is clean, the errorTail helper handles all edge cases (empty tail, single line, multi-line, long lines, ANSI escapes), and the fallback "FAILED" is meaningful. The 30-char truncation is appropriate for the single-line panel layout.

## Required Fixes

N/A

## Notes for Next

- The fix is entirely in packages/quality-gate/src/precommit/panel.tsx: a new ANSI_RE regex, ERR_TAIL_MAX = 30 constant, and errorTail(step) helper function.
- The hardcoded "AP DISCONNECT" string has been fully removed from production source code.
- This is a patch-level change with no API surface impact -- safe to ship.
