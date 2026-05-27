# US-001 Product Handoff: ECAM Panel Width Overflow + Truncation Fix

## Bug Description

When `logDir` paths are long (e.g. deeply nested home directories), ECAM panel rows overflow the right `║` border. The panel is supposed to be exactly IW=60 visible characters wide between the borders, but values longer than the available space were not being truncated.

## Root Cause

Two issues in `packages/logger-collector/internal/banner/`:

1. **`fitValue` used `len([]rune(val))` for the value length check** -- this does not account for ANSI escape sequences in `val` (e.g. colored values). The prefix length was also computed with raw rune count instead of `visLen()`, so the "available space" calculation was wrong when the prefix contained ANSI codes.

2. **`padVisible` only padded shorter strings, never truncated longer ones** -- `rowLine` called `padVisible` which returned strings as-is when they exceeded IW, causing overflow past the `║` border.

## Fix Already Applied

The following changes have been manually applied to the source files:

### `panel.go`

- **Box-drawing characters** now use UTF-8 literals directly (`╔`, `╗`, `╠`, `╣`, `╚`, `╝`, `║`) instead of Unicode escape sequences, matching the quality-gate ECAM panel style.
- **`rowLine`** now calls `padOrTruncate(content, IW)` instead of `padVisible`, ensuring content that exceeds IW is truncated rather than overflowing.
- **`fitValue`** now uses `visLen(prefix)` instead of `len([]rune(prefix))` for the prefix length, and reserves `-1` for right padding. Falls back to a minimum available width of 4 characters.
- **`printInstallRows`** handles multi-line install hints (brew `&&` split) and single-line hints through `fitValue` + `rowLine`, both of which now enforce width limits.

### `colors.go`

- **`padOrTruncate`** is a new function that pads short strings to width `w` and truncates long strings to width `w`, preserving ANSI escape sequences during truncation.
- **`truncateVisible`** is a helper that walks the string rune-by-rune, keeping ANSI codes intact while counting only visible characters up to the limit `w`, then pads if the result is short.

## Developer Task

1. **Verify the fix is correct** -- review the changes in `panel.go` and `colors.go` to confirm:
    - All panel rows render at exactly IW=60 visible width
    - `fitValue` correctly accounts for ANSI-colored prefixes via `visLen`
    - `padOrTruncate` / `truncateVisible` preserve ANSI codes while truncating visible content
    - Box-drawing chars are UTF-8 literals, not escapes
2. **Run quality checks**: `go build`, `go vet`, `pnpm --filter @agent-ils/logger build`
3. **Add a changeset file** to `.changeset/` for this bugfix (patch bump for `@agent-ils/logger`)
4. **Commit** with message: `fix(logger-collector): truncate long values in ECAM panel to prevent border overflow`
