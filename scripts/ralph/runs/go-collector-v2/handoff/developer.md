# Developer Handoff: US-002 -- --help Output Format Aligned with quality-gate

> Status: IMPLEMENTED, ready for tester
> Branch: feat/logger-go-collector

---

## What was implemented

Replaced Go flag package's default `PrintDefaults()` help output with a custom formatted help renderer that matches quality-gate's `renderHelp()` pattern (banner + structured help text with ANSI colors). Also fixed the BOT border corner characters from the US-001 tester observation.

## Files changed

### New files

| File                      | Purpose                                                                                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `internal/banner/help.go` | `PrintHelp(w io.Writer, prefix string)` with structured help rendering, `helpSection`/`helpLine` types, ANSI colors (C.Wht/C.Grn/C.Gry), `labelWidth()` alignment |

### Modified files

| File                       | Changes                                                                                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `internal/banner/panel.go` | Fixed BOT border corners: `\u2558\u2559` -> `\u255A\u255B` (light -> double box-drawing variants matching TOP/MID)                                                                            |
| `main.go`                  | `detectSubcommand()`: intercept `--help`/`-h` before `fs.Parse()`, call `banner.PrintHelp(os.Stderr, prefix)` + `os.Exit(0)`. Removed `fs.Usage` overrides from `runServe()` and `runRead()`. |

## Verification results

All help modes verified:

1. **`./agent-ils-logger --help`**: Banner (gradient) + structured help, Usage shows `agent-ils-logger`
2. **`./agent-ils-logger -h`**: Identical output to --help
3. **`AGENT_ILS_INVOKER=npx ./agent-ils-logger --help`**: Usage shows `npx @agent-ils/logger`, Examples still hardcoded
4. **`./agent-ils-logger serve --help`**: Unified help (all commands + all options)
5. **`./agent-ils-logger`** (no args): Starts server normally, does NOT show help
6. **Non-TTY output**: No ANSI escape codes (supportsANSI guard works correctly)
7. **BOT border**: Now uses `╚╝` matching TOP `╔╗` and MID `╠╣`

- `go build ./...` -- PASS
- `go vet ./...` -- PASS
- Zero external dependencies added

## Key design decisions

- **Early interception**: `--help`/`-h` caught in `detectSubcommand()` before any `fs.Parse()` call. This produces a unified help page (all commands + all options) rather than subcommand-specific help, matching quality-gate's single-page pattern.
- **Structured rendering**: `helpSection`/`helpLine` types keep the help template data-driven and easy to modify. No embedded ANSI codes in string literals.
- **Dynamic Usage, hardcoded Examples**: Usage section uses `invokePrefix` (varies by mode). Examples use hardcoded `agent-ils-logger` and `npx @agent-ils/logger` strings, matching quality-gate's multi-PM example pattern.
- **labelWidth()**: Automatically computes the alignment column from sections that have descriptions (Commands, Serve Options, Read Options), so descriptions always align properly.

## Acceptance criteria mapping

| #   | AC                                                                                   | Status |
| --- | ------------------------------------------------------------------------------------ | ------ |
| 1   | --help / -h outputs Banner (gradient) + blank line + help                            | PASS   |
| 2   | Help format matches quality-gate: Usage/Commands/Options/Examples sections           | PASS   |
| 3   | Usage line uses detected invokePrefix                                                | PASS   |
| 4   | Help text uses ANSI colors: title=bright white, labels=green, description=light gray | PASS   |
| 5   | No longer uses Go flag package's PrintDefaults()                                     | PASS   |
| 6   | go build succeeds, go vet passes                                                     | PASS   |

## Gotchas for tester

- Help output goes to stderr (same as banner/ECAM in US-001).
- Colors only appear on TTY; piped output is plain text (supportsANSI guard).
- The `serve --help` interception works because `detectSubcommand` scans ALL args for `--help`/`-h`, not just the first positional arg.
- The BOT border fix (panel.go) affects both the banner help output and the normal server startup panel.
