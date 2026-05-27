# Product Handoff: US-001 -- Brand Banner + ECAM Info Panel + Platform-Aware Output

> Target: `feat/logger-go-collector` branch, `packages/logger-collector/`
> Scope: Replace plain-text startup output with branded banner + ECAM-style info panel

---

## 1. Exact Banner ASCII Art

Source of truth: `packages/quality-gate/templates/banner.txt`

Copy this **verbatim** into the Go banner package as a raw string literal:

```
     ___     _____  ______  __   _  _______  _____  __       _____
    / _ \   / ____||  ____||  \ | ||__   __||_   _|| |     / ____|
   / /_\ \ | |  __ | |__   |   \| |   | |     | |  | |    | (___
  / ___  \ | | |_ ||  __|  | |\   |   | |     | |  | |     \___ \
 / /   \  \| |__| || |____ | | \  |   | |    _| |_ | |____ ____) |
/_/     \__\\_____||______||_|  \_|   |_|   |_____||______|_____/
```

- 6 lines, no trailing newline inside the constant (add newline between banner and panel during rendering).
- Width of the longest line is 67 characters (the last line).

---

## 2. Exact Banner Colorization Algorithm

Source of truth: `packages/quality-gate/src/index.ts` -- `BANNER_COLORS` + `colorizeBanner()`

### 2.1 Gradient Colors (5 stops, xterm-256)

```go
var bannerColors = [5]string{
    "\x1b[38;5;75m",  // cyan-blue
    "\x1b[38;5;105m", // medium purple
    "\x1b[38;5;141m", // lavender
    "\x1b[38;5;175m", // rose
    "\x1b[38;5;204m", // pink
}
```

### 2.2 Colorization Logic

Port this TypeScript verbatim to Go:

```typescript
// TypeScript source (quality-gate/src/index.ts lines 398-413)
function colorizeBanner(banner: string): string {
    if (!supportsAnsi()) return banner
    return banner
        .split('\n')
        .map((line) =>
            [...line]
                .map((character, index) => {
                    if (character === ' ') return character
                    const color =
                        BANNER_COLORS[Math.floor((index / Math.max(line.length - 1, 1)) * (BANNER_COLORS.length - 1))]
                    return `${color}${character}${ANSI_RESET}`
                })
                .join(''),
        )
        .join('\n')
}
```

Go equivalent:

```go
func colorizeBanner(banner string) string {
    if !supportsANSI() {
        return banner
    }
    lines := strings.Split(banner, "\n")
    var sb strings.Builder
    for i, line := range lines {
        if i > 0 {
            sb.WriteByte('\n')
        }
        runes := []rune(line)
        lineLen := len(runes)
        for j, ch := range runes {
            if ch == ' ' {
                sb.WriteRune(ch)
                continue
            }
            idx := int(float64(j) / float64(max(lineLen-1, 1)) * float64(len(bannerColors)-1))
            sb.WriteString(bannerColors[idx])
            sb.WriteRune(ch)
            sb.WriteString("\x1b[0m")
        }
    }
    return sb.String()
}

func max(a, b int) int {
    if a > b {
        return a
    }
    return b
}
```

Key rules:

- Spaces are **never** colored (left bare).
- Every non-space character gets its own color + reset (`\x1b[0m`).
- The interpolation index is computed per character as: `floor(charIndex / (lineLen-1) * 4)`.
- Guard against `lineLen == 1` (single-char line) by clamping denominator to `max(lineLen-1, 1)`.

---

## 3. Exact ECAM Color Constants

Source of truth: `packages/quality-gate/src/precommit/panel.tsx` -- `C` object (lines 23-33)

```go
// C holds the ANSI color constants, matching the ECAM panel in quality-gate.
var C = struct {
    Grn, Brt, Amb, Wht, Cyn, Dim, Red, Gry, Rst string
}{
    Grn: "\x1b[32m",      // standard green
    Brt: "\x1b[1;32m",    // bright green (bold)
    Amb: "\x1b[33m",      // amber/yellow
    Wht: "\x1b[1;37m",    // bright white (bold)
    Cyn: "\x1b[36m",      // cyan
    Dim: "\x1b[2;32m",    // dim green -- box-drawing border color
    Red: "\x1b[31m",      // red
    Gry: "\x1b[90m",      // gray
    Rst: "\x1b[0m",       // reset
}
```

---

## 4. Exact Box-Drawing Pattern

Source of truth: `packages/quality-gate/src/precommit/panel.tsx` -- `IW`, `TOP`, `MID`, `BOT`, `rowLine()` (lines 21, 46-52)

```go
const IW = 60 // inner width, exactly matching quality-gate ECAM panel

// Box-drawing borders -- all use C.Dim (dim green) for border characters
var TOP = C.Dim + "\u2554" + strings.Repeat("\u2550", IW) + "\u2557" + C.Rst  // ╔═...═╗
var MID = C.Dim + "\u2560" + strings.Repeat("\u2550", IW) + "\u2563" + C.Rst  // ╠═...═╣
var BOT = C.Dim + "\u2558" + strings.Repeat("\u2550", IW) + "\u2559" + C.Rst  // ╚═...═╝

func rowLine(content string) string {
    // Pad content to IW visible characters, then wrap with ║ borders
    padded := padVisible(content, IW)
    return C.Dim + "\u2551" + C.Rst + padded + C.Dim + "\u2551" + C.Rst
}
```

`padVisible` must strip ANSI escape sequences when computing visible width, then pad with spaces.

### `visLen` helper (port from panel.tsx line 37):

```go
// visLen returns the visible (non-ANSI) length of a string.
func visLen(s string) int {
    re := regexp.MustCompile(`\x1b\[[0-9;]*m`)
    return utf8.RuneCountInString(re.ReplaceAllString(s, ""))
}
```

### `padVisible` helper:

```go
func padVisible(s string, width int) string {
    vl := visLen(s)
    if vl >= width {
        return s
    }
    return s + strings.Repeat(" ", width-vl)
}
```

---

## 5. File Structure for New `internal/banner/` Package

```
packages/logger-collector/
  internal/
    banner/
      banner.go    -- ASCII art constant, colorizeBanner(), supportsANSI()
      colors.go    -- C color constants, bannerColors gradient array
      panel.go     -- ECAM panel rendering: TOP/MID/BOT/rowLine, PrintServer(), PrintJSON()
      detect.go    -- detectInvoker(), invokePrefix(), installHint()
    server/
      server.go    -- modified: remove printStartupHuman/JSON, call banner.PrintServer/PrintJSON
  main.go          -- modified: detect invoker, pass params to server
```

### 5.1 `banner.go`

- `const asciiBanner` = the raw 6-line banner text (section 1 above).
- `func ColorizeBanner(banner string) string` = the gradient algorithm (section 2).
- `func supportsANSI() bool` = check `os.Stderr` is a terminal and `NO_COLOR` is unset and `TERM != "dumb"`.

### 5.2 `colors.go`

- `var C` struct with all 9 color constants (section 3).
- `var bannerColors [5]string` gradient array (section 2.1).
- `const IW = 60`.
- Helper functions: `visLen()`, `padVisible()`.

### 5.3 `panel.go`

- `func PrintServer(w io.Writer, params ServerParams)` -- renders the full banner + ECAM info panel to `w`.
- `func PrintJSON(w io.Writer, params ServerParams)` -- outputs JSON (no banner).
- `ServerParams` struct:

```go
type ServerParams struct {
    Version     string
    Endpoint    string
    LogDir      string
    ReadCmd     string  // e.g. "agent-ils-logger read --tail 50"
    InstallHint string  // empty string means "don't show install row"
}
```

### 5.4 `detect.go`

- `func DetectInvoker() string` -- section 6 below.
- `func InvokePrefix(mode string) string` -- section 8 below.
- `func InstallHint() string` -- section 7 below.

---

## 6. Invocation Detection Algorithm

Priority order (first match wins):

1. **npx mode**: `os.Getenv("AGENT_ILS_INVOKER") == "npx"` --> return `"npx"`
2. **gorun mode**: `strings.Contains(os.Args[0], "go-build")` --> return `"gorun"`
3. **binary mode**: default --> return `"binary"`

```go
func DetectInvoker() string {
    if os.Getenv("AGENT_ILS_INVOKER") == "npx" {
        return "npx"
    }
    if strings.Contains(os.Args[0], "go-build") {
        return "gorun"
    }
    return "binary"
}
```

Note: `go run` compiles to a temp directory like `/tmp/go-build123456/...`, so checking for `"go-build"` in `os.Args[0]` is the standard detection method.

---

## 7. Platform-Aware Install Hints

Only shown in **binary** mode. Not shown in npx or gorun modes.

```go
func InstallHint() string {
    switch runtime.GOOS {
    case "darwin":
        return "brew tap bugfix2020/agentils && brew install agent-ils-logger"
    case "windows":
        return "winget install bugfix2020.AgentILS.Logger"
    default:
        return "https://github.com/bugfix2020/AgentILS/releases"
    }
}
```

When mode is `npx` or `gorun`, pass empty string as `InstallHint` so the panel omits the install row.

---

## 8. Invoke Prefix Mapping

```go
func InvokePrefix(mode string) string {
    switch mode {
    case "npx":
        return "npx @agent-ils/logger"
    case "gorun":
        return "go run ."
    default:
        return "agent-ils-logger"
    }
}
```

The `ReadCmd` in `ServerParams` is constructed as: `InvokePrefix(mode) + " read --tail 50"`.

---

## 9. How `server.go` Changes

### 9.1 Remove

Delete these two functions entirely:

- `printStartupHuman(endpoint string, logDir string)`
- `printStartupJSON(endpoint string, logDir string)`

### 9.2 Modify `Start()` signature

Change from:

```go
func (s *Server) Start(ctx context.Context, jsonOutput bool, silentOutput bool) error
```

To:

```go
func (s *Server) Start(ctx context.Context, params banner.ServerParams, jsonOutput bool, silentOutput bool) error
```

### 9.3 Replace startup output block

Change from:

```go
if !silentOutput {
    if jsonOutput {
        printStartupJSON(endpoint, s.LogDir)
    } else {
        printStartupHuman(endpoint, s.LogDir)
    }
}
```

To:

```go
if !silentOutput {
    params.Endpoint = endpoint
    params.LogDir = s.LogDir
    if jsonOutput {
        banner.PrintJSON(os.Stderr, params)
    } else {
        banner.PrintServer(os.Stderr, params)
    }
}
```

---

## 10. How `main.go` Changes

### 10.1 Add detection in `runServe()`

After flag parsing and before creating the server, add:

```go
mode := banner.DetectInvoker()
readCmd := banner.InvokePrefix(mode) + " read --tail 50"
installHint := ""
if mode == "binary" {
    installHint = banner.InstallHint()
}
params := banner.ServerParams{
    Version:     version,
    ReadCmd:     readCmd,
    InstallHint: installHint,
}
```

Then pass `params` to `srv.Start()`.

### 10.2 `--version` output stays unchanged

The existing `--version` / `-v` handler in `detectSubcommand` already prints `agent-ils-logger <version>` and exits. No change needed.

---

## 11. Exact Output Format Per Mode

All output goes to **stderr** (`os.Stderr`).

### 11.1 Binary + macOS (full output)

```
[gradient banner]

╔══════════════════════════════════════════════════════════╗
║  AGENTILS  LOGGER SERVICE · v0.1.0                      ║
╠══════════════════════════════════════════════════════════╣
║  ● server ready                                         ║
║                                                         ║
║  endpoint   http://127.0.0.1:12138                      ║
║  logDir     /path/to/.agent-ils/logger/logs             ║
║                                                         ║
║  read       agent-ils-logger read --tail 50             ║
║  install    brew tap bugfix2020/agentils &&             ║
║             brew install agent-ils-logger               ║
╚══════════════════════════════════════════════════════════╝
```

Panel construction:

1. `TOP`
2. Header row: `rowLine("  " + C.Wht + "AGENTILS  LOGGER SERVICE" + C.Rst + " · " + version)`
3. `MID`
4. Status row: `rowLine("  " + C.Brt + "\u25cf" + C.Rst + " server ready")`
5. Empty row: `rowLine("")`
6. Endpoint row: `rowLine("  endpoint   " + endpoint)`
7. LogDir row: `rowLine("  logDir     " + logDir)`
8. Empty row: `rowLine("")`
9. Read row: `rowLine("  read       " + readCmd)`
10. Install row (if non-empty): `rowLine("  install    " + installHint)` -- if installHint is longer than IW-14, wrap to next line with `"             "` continuation prefix
11. `BOT`

### 11.2 Binary + Windows

Same as above, but install line shows:

```
║  install    winget install bugfix2020.AgentILS.Logger   ║
```

### 11.3 Binary + Linux

Same as above, but install line shows:

```
║  install    https://github.com/bugfix2020/AgentILS/rele…║
```

(If the URL exceeds IW-14 visible chars, truncate with `...`)

### 11.4 npx mode

```
[gradient banner]

╔══════════════════════════════════════════════════════════╗
║  AGENTILS  LOGGER SERVICE · v0.1.0                      ║
╠══════════════════════════════════════════════════════════╣
║  ● server ready                                         ║
║                                                         ║
║  endpoint   http://127.0.0.1:12138                      ║
║  logDir     /path/to/.agent-ils/logger/logs             ║
║                                                         ║
║  read       npx @agent-ils/logger read --tail 50        ║
╚══════════════════════════════════════════════════════════╝
```

No install row.

### 11.5 go run mode

```
[gradient banner]

╔══════════════════════════════════════════════════════════╗
║  AGENTILS  LOGGER SERVICE · dev                         ║
╠══════════════════════════════════════════════════════════╣
║  ● server ready                                         ║
║                                                         ║
║  endpoint   http://127.0.0.1:12138                      ║
║  logDir     /path/to/.agent-ils/logger/logs             ║
║                                                         ║
║  read       go run . read --tail 50                     ║
╚══════════════════════════════════════════════════════════╝
```

No install row. Version shows `dev` (the ldflags default).

### 11.6 JSON mode (`--json`)

Output to stderr, no banner, JSON object:

```json
{
    "ok": true,
    "endpoint": "http://127.0.0.1:12138",
    "logDir": "/path/to/.agent-ils/logger/logs",
    "read": "agent-ils-logger read --tail 50",
    "installHint": "brew tap bugfix2020/agentils && brew install agent-ils-logger"
}
```

- `read` field uses the platform-appropriate command.
- `installHint` field is present for binary mode (platform-specific), absent for npx/gorun.
- When absent, omit the key entirely (do not set to null or empty string).

### 11.7 `--silent` mode

No output at all. No banner, no panel, no JSON. Function returns immediately.

---

## 12. Content Truncation Rule

Any value that would make a row exceed IW (60) visible characters inside the borders must be truncated.

Algorithm:

1. Compute visible length of the full row content (between the `║` borders).
2. If `visLen(content) > IW`, truncate from the end.
3. Replace the last 1 character with `...` (3 chars, so total = truncated_len - 1 + 3).
4. Final visible length must equal IW exactly.

Example: if content is `"  install    https://github.com/bugfix2020/AgentILS/releases"` and visible length is 65, truncate to fit IW=60.

For install hints that are long (like the `brew` two-liner), use line wrapping instead:

- First line: `"  install    brew tap bugfix2020/agentils &&"`
- Second line: `"             brew install agent-ils-logger"`
- Wrap only happens for `install` field when content exceeds IW.

---

## 13. Status Indicator

The `●` character is `\u25cf` (BLACK CIRCLE), rendered in bright green:

```go
C.Brt + "\u25cf" + C.Rst
```

This matches the ECAM panel `stepIndicator('passed')` in panel.tsx (line 99):

```typescript
case 'passed':
    return `${C.brt}\u25cf${C.rst}`
```

---

## 14. Summary of Acceptance Criteria Mapping

| AC                                        | Where Implemented                                              |
| ----------------------------------------- | -------------------------------------------------------------- |
| Banner identical to banner.txt            | `internal/banner/banner.go` constant                           |
| 5-color gradient interpolation            | `internal/banner/banner.go` colorizeBanner()                   |
| ECAM box-drawing, dim green border, IW=60 | `internal/banner/panel.go` using `internal/banner/colors.go`   |
| Header row with version                   | `internal/banner/panel.go` PrintServer()                       |
| Version from ldflags                      | `main.go` `var version = "dev"` passed to params               |
| Status indicator bright green circle      | `internal/banner/panel.go` using `C.Brt + "\u25cf" + C.Rst`    |
| Invoker detection                         | `internal/banner/detect.go` DetectInvoker()                    |
| Platform install hints                    | `internal/banner/detect.go` InstallHint()                      |
| npx/gorun no install row                  | `main.go` conditional on mode                                  |
| Content truncation                        | `internal/banner/panel.go` truncateRow()                       |
| JSON mode no banner                       | `internal/banner/panel.go` PrintJSON()                         |
| --silent no output                        | `server.go` early return before banner.Print                   |
| Output to stderr                          | All Print functions write to `io.Writer` passed as `os.Stderr` |
| go build + go vet pass                    | Must verify after implementation                               |
