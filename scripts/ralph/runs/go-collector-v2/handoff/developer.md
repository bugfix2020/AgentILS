# Developer Handoff: US-001 -- Brand Banner + ECAM Info Panel + Platform-Aware Output

> Status: IMPLEMENTED, ready for tester
> Branch: feat/logger-go-collector

---

## What was implemented

Replaced plain-text startup output with branded ASCII banner (5-color gradient) + A320 ECAM-style info panel in the Go binary (`packages/logger-collector`).

## Files changed

### New files (internal/banner/ package)

| File                        | Purpose                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `internal/banner/colors.go` | C color struct (9 ANSI constants), bannerColors gradient array (5 xterm-256), IW=60, visLen(), padVisible(), truncatePlain() helpers  |
| `internal/banner/banner.go` | asciiBanner constant (verbatim from quality-gate templates/banner.txt), ColorizeBanner() gradient algorithm, supportsANSI() TTY guard |
| `internal/banner/panel.go`  | ServerParams struct, TOP/MID/BOT box-drawing borders, rowLine(), fitValue(), PrintServer(), PrintJSON(), printInstallRows()           |
| `internal/banner/detect.go` | DetectInvoker() (npx/gorun/binary), InvokePrefix(), InstallHint() (platform-specific)                                                 |

### Modified files

| File                        | Changes                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `internal/server/server.go` | Removed printStartupHuman/printStartupJSON. Added banner.ServerParams to Start() signature. Output now goes to stderr via banner.PrintServer/PrintJSON. |
| `main.go`                   | Added detection in runServe(): calls DetectInvoker(), builds ServerParams with version/readCmd/installHint. Passes params to srv.Start().               |

## Verification results

All modes verified:

1. **Binary mode (macOS)**: Banner + ECAM panel with brew install hint (two-line wrap)
2. **Binary mode + --json**: JSON to stderr, includes installHint, no banner
3. **Binary mode + --silent**: No output
4. **npx mode** (AGENT_ILS_INVOKER=npx): No install row, read shows "npx @agent-ils/logger"
5. **npx + --json**: JSON omits installHint key entirely
6. **gorun mode** (go run .): No install row, read shows "go run .", version shows "dev"
7. **read command**: Still works (`./agent-ils-logger read --tail 5`)
8. **--version**: Still works

- `go build ./...` -- PASS
- `go vet ./...` -- PASS
- Zero external dependencies added

## Key design decisions

- **fitValue()** for truncation: uses plain-text rune counting since the values (endpoint, logDir, installHint) are plain text. Label prefixes are known-width constants.
- **printInstallRows()** for wrapping: splits on " && " for brew hints, uses continuation line with 13-space indent. Single-line hints (winget, URL) use truncation if over-width.
- **supportsANSI()** checks stderr (not stdout) since all output goes to stderr.
- **JSON mode** uses `json.Marshal` on a map; empty InstallHint causes the key to be omitted entirely.

## Gotchas for tester

- The banner appears without colors when piped (supportsANSI returns false for non-TTY). This is correct behavior matching quality-gate.
- The logDir value in the panel may be truncated with "..." depending on path length.
- The brew install hint wraps across two lines; winget and URL hints fit on one line.
- `go run .` detection uses `strings.Contains(os.Args[0], "go-build")` which matches Go's temp build directory pattern.
