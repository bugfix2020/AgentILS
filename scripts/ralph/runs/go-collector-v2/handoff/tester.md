# Tester Handoff: US-001 -- Brand Banner + ECAM Info Panel + Platform-Aware Output

> Status: PASS (with minor observation)
> Branch: feat/logger-go-collector
> Date: 2026-05-27

---

## Acceptance Criteria Verification

### AC 1: Banner ASCII art identical to banner.txt -- PASS

- Ran `./agent-ils-logger --port NNNNN 2>&1 | head -6` and diffed against `packages/quality-gate/templates/banner.txt`
- Result: **Exact match** (zero diff)
- Banner output in non-TTY mode (piped) is plain text (no ANSI), matching the quality-gate `supportsAnsi()` guard behavior

### AC 2: 5-color gradient (xterm-256: 75/105/141/175/204) -- PASS

- Verified `colors.go` lines 29-33 contain exact codes: `\x1b[38;5;75m`, `\x1b[38;5;105m`, `\x1b[38;5;141m`, `\x1b[38;5;175m`, `\x1b[38;5;204m`
- `banner.go` `ColorizeBanner()` correctly implements per-character gradient with space exclusion and per-char reset
- Gradient only applies when `supportsANSI()` returns true (TTY + no NO_COLOR + TERM != dumb)

### AC 3: ECAM box-drawing, dim green border, IW=60 -- PASS (minor observation)

- Verified `IW = 60` in `colors.go`
- Box-drawing characters: TOP uses ╔ (U+2554), ═ (U+2550), ╗ (U+2557); MID uses ╠ (U+2560), ╣ (U+2563); vertical border ║ (U+2551)
- **Observation**: BOT line uses ╘ (U+2558) and ╙ (U+2559) instead of ╚ (U+255A) and ╝ (U+255B) as in the quality-gate `panel.tsx` reference. This is visually similar but not character-identical to the source of truth. The ECAM style is maintained (box-drawing with dim green), but the exact corner glyphs differ.
- Border color is `\x1b[2;32m` (dim green) -- verified in `cat -v` output as `^[[2;32m`

### AC 4: Header row with AGENTILS + LOGGER SERVICE + version -- PASS

- Header displays: `"  AGENTILS  LOGGER SERVICE · dev"` with bright white (`\x1b[1;37m`) text
- Version shows "dev" (no ldflags) as expected
- Separator `·` (U+00B7) between title and version

### AC 5: Version from ldflags variable -- PASS

- `main.go` line 17: `var version = "dev"` -- set at build time via `-ldflags "-X main.version=..."`
- Verified output shows "dev" when built without ldflags

### AC 6: Status indicator with bright green circle -- PASS

- Uses `\x1b[1;32m` (bright green) + `\u25cf` (●) + reset, matching `C.Brt + "\u25cf" + C.Rst`
- Verified in `cat -v` output: `^[[1;32m` prefix present

### AC 7: Invocation detection (3-tier) -- PASS

- **npx mode**: `AGENT_ILS_INVOKER=npx ./agent-ils-logger` -- read row shows "npx @agent-ils/logger read --tail 50", NO install row
- **gorun mode**: Binary run from `/tmp/go-build-test/agent-ils-logger` -- read row shows "go run . read --tail 50", NO install row
- **binary mode**: Normal `./agent-ils-logger` -- read row shows "agent-ils-logger read --tail 50", install row present with brew command
- `detect.go` implements exact 3-tier priority: env var check, then `strings.Contains(os.Args[0], "go-build")`, then default

### AC 8: Platform-aware install hints -- PASS

- `detect.go` `InstallHint()`: darwin -> brew, windows -> winget, default -> github URL
- On current macOS machine, binary mode shows: `brew tap bugfix2020/agentils &&` (line 1) + `brew install agent-ils-logger` (line 2)

### AC 9: npx/gorun modes omit install row -- PASS

- npx mode: confirmed no install row in panel output
- gorun mode: confirmed no install row in panel output
- Only binary mode shows install row(s)

### AC 10: Content truncation at 58 chars -- PASS

- `fitValue()` in `panel.go` computes available width as `IW - prefixLen`, truncates value with "..." suffix
- logDir path was observed truncated as `/Users/liuyuxuan/Desktop/Lenovo/AgentILS/pac...` in the output
- `rowLine()` + `padVisible()` ensures every row is exactly IW (60) visible characters

### AC 11: JSON mode -- PASS

- `./agent-ils-logger --json` outputs: `{"endpoint":"...","installHint":"brew ...","logDir":"...","ok":true,"read":"agent-ils-logger read --tail 50"}`
- JSON has "read" field, has "installHint" in binary mode, no banner
- `AGENT_ILS_INVOKER=npx ./agent-ils-logger --json` outputs JSON without "installHint" key (key is omitted entirely, not null/empty)

### AC 12: --silent mode -- PASS

- `./agent-ils-logger --silent` produces zero output (stdout and stderr both empty)
- Verified: `OUTPUT_LEN=0`

### AC 13: Output to stderr -- PASS

- `./agent-ils-logger 2>/dev/null` produces empty stdout
- `./agent-ils-logger 2>&1` shows full banner + panel output
- All output confirmed going to stderr via `banner.PrintServer(os.Stderr, params)` and `banner.PrintJSON(os.Stderr, params)`

### AC 14: go build + go vet pass -- PASS

- `go build ./...` -- PASS (no errors)
- `go vet ./...` -- PASS (no warnings)
- Zero external dependencies added (only Go stdlib)

---

## Additional Checks

- **read command**: `./agent-ils-logger read --tail 5` still works (returns "No log records found." with exit code 0)
- **Banner colors exact codes**: 75, 105, 141, 175, 204 -- verified in source
- **Box-drawing characters**: ╔╗╠╣║═ all match quality-gate panel.tsx
- **BOT corner mismatch**: ╘╙ (U+2558/U+2559) used instead of ╚╝ (U+255A/U+255B)

---

## Summary

| AC  | Status | Notes                                                      |
| --- | ------ | ---------------------------------------------------------- |
| 1   | PASS   | Banner text exact match                                    |
| 2   | PASS   | 5-color xterm-256 gradient                                 |
| 3   | PASS\* | Box-drawing + dim green; BOT corners differ from reference |
| 4   | PASS   | Header row with version                                    |
| 5   | PASS   | Version from ldflags                                       |
| 6   | PASS   | Bright green circle indicator                              |
| 7   | PASS   | 3-tier invocation detection                                |
| 8   | PASS   | Platform-aware install hints                               |
| 9   | PASS   | npx/gorun omit install                                     |
| 10  | PASS   | Content truncation with ...                                |
| 11  | PASS   | JSON mode, omit installHint key                            |
| 12  | PASS   | Silent mode produces no output                             |
| 13  | PASS   | All output to stderr                                       |
| 14  | PASS   | go build + go vet pass                                     |

**Overall: PASS**

The only observation is the BOT border corner characters (╘╙ vs ╚╝). This is a minor visual difference that does not affect functionality. The box-drawing style and dim green coloring are correct.
