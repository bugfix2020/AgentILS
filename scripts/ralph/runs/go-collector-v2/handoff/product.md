# US-002 Product Handoff: --help Output Format Aligned with quality-gate

> Target: `feat/logger-go-collector` branch, `packages/logger-collector/`
> Scope: Replace Go flag.Usage/PrintDefaults with custom help renderer matching quality-gate renderHelp() pattern
> Depends on: US-001 (already done -- banner, detect, colors packages exist)

---

## 1. Exact Help Text to Produce

The help output is: **banner (gradient) + blank line + colored structured plain-text**.

The plain-text section follows the quality-gate `templates/help.txt` layout exactly: title, Usage, Commands, Options, Examples.

### Template (invokePrefix is dynamic, Examples are hardcoded)

```
<gradient banner output from ColorizeBanner()>

AgentILS Logger

Usage:
    <invokePrefix> serve [flags]
    <invokePrefix> read [flags]

Commands:
    serve              Start HTTP log collector (default)
    read               Query and read JSONL log files

Serve Options:
    --host <addr>      HTTP bind host (default: 127.0.0.1)
    --port <num>       HTTP bind port (default: 12138)
    --log-dir <path>   JSONL output directory
    --file-prefix <s>  Default file prefix for JSONL files (default: agent-ils)
    --json             Output startup info as JSON
    --silent           Suppress startup output

Read Options:
    --tail <n>         Number of recent records (default: 50)
    --from <time>      Start time filter (ISO, epoch ms, or 10m/2h/1d)
    --to <time>        End time filter
    --source <s>       Filter by source field
    --level <s>        Filter by level field (case-insensitive)
    --event <s>        Filter by event field
    --format <fmt>     Output format: text, json, jsonl (default: text)

Examples:
    agent-ils-logger serve
    agent-ils-logger serve --port 8080
    agent-ils-logger read --tail 50
    agent-ils-logger read --from 10m --format json
    npx @agent-ils/logger serve
```

### invokePrefix substitution (Usage section only)

Resolved at help-render time using `banner.DetectInvoker()` + `banner.InvokePrefix()`:

| Mode   | invokePrefix value      |
| ------ | ----------------------- |
| npx    | `npx @agent-ils/logger` |
| gorun  | `go run .`              |
| binary | `agent-ils-logger`      |

The **Examples section uses hardcoded strings** (`agent-ils-logger` and `npx @agent-ils/logger`), not invokePrefix. This matches quality-gate's help.txt which shows multiple package manager examples side-by-side.

---

## 2. ANSI Color Scheme for Help Text

Apply these three ANSI colors to the help text. Guard all colorization behind `supportsANSI()` (already in `internal/banner/banner.go`).

| Element        | ANSI Sequence        | Purpose                           |
| -------------- | -------------------- | --------------------------------- |
| Section titles | `\x1b[1;37m` (C.Wht) | "Usage:", "Commands:", etc.       |
| Labels/flags   | `\x1b[32m` (C.Grn)   | `serve`, `--host`, `--port`, etc. |
| Descriptions   | `\x1b[90m` (C.Gry)   | "Start HTTP log collector..."     |
| Reset          | `\x1b[0m` (C.Rst)    | After each colored segment        |

The title line "AgentILS Logger" is also in bright white (`C.Wht`).

### Note on quality-gate reference

quality-gate's `renderHelp()` composes `renderBanner() + "\n" + readTemplate('help.txt')`. The `help.txt` is plain text without ANSI codes. However, the PRD acceptance criteria explicitly require ANSI colors on the help text (title=bright white, labels=green, description=light gray). So we **must** add ANSI colors programmatically in Go.

### Coloring approach

Color the help text programmatically using structured data, not by embedding ANSI codes in template strings:

- **Title line** (`AgentILS Logger`): wrap entire line with `C.Wht` + `C.Rst`
- **Section headers** (`Usage:`, `Commands:`, `Serve Options:`, `Read Options:`, `Examples:`): wrap with `C.Wht` + `C.Rst`
- **Command/flag names** (first column before the spacing gap): wrap with `C.Grn` + `C.Rst`
- **Descriptions** (text after the spacing gap): wrap with `C.Gry` + `C.Rst`

---

## 3. How to Replace Go flag.Usage with Custom Help Renderer

### Current state (in main.go)

```go
// runServe
fs.Usage = func() {
    fmt.Fprintf(os.Stderr, "Usage: %s serve [flags]\n\nFlags:\n", os.Args[0])
    fs.PrintDefaults()
}

// runRead
fs.Usage = func() {
    fmt.Fprintf(os.Stderr, "Usage: %s read [flags]\n\nFlags:\n", os.Args[0])
    fs.PrintDefaults()
}
```

### New approach

1. **Remove** `fs.Usage` overrides from both `runServe()` and `runRead()`.
2. **Intercept `--help` / `-h` early in `detectSubcommand()`** (before `fs.Parse()` is called in any subcommand path). Currently `detectSubcommand` routes `--help` to `"serve"` which then falls through to flag's default handling. Change it to:
    ```go
    if arg == "--help" || arg == "-h" {
        mode := banner.DetectInvoker()
        prefix := banner.InvokePrefix(mode)
        banner.PrintHelp(os.Stderr, prefix)
        os.Exit(0)
    }
    ```
3. The `flag` package never sees `--help`, so its default usage handler is never triggered. This is clean and produces a unified help page for all subcommands.

### Why intercept in detectSubcommand, not in fs.Usage

Overriding `fs.Usage` would produce subcommand-specific help (serve-only or read-only). The PRD wants a **unified** help page showing all commands and all options, exactly like quality-gate's single help page. Intercepting before subcommand dispatch achieves this.

---

## 4. Where to Put the Help Template Code

### New file: `internal/banner/help.go`

The `banner` package already owns:

- `banner.go` -- gradient banner (`ColorizeBanner()`)
- `colors.go` -- color constants (`C`), visLen, padVisible
- `panel.go` -- ECAM info panel (`PrintServer()`, `PrintJSON()`)
- `detect.go` -- invoker detection (`DetectInvoker()`, `InvokePrefix()`, `InstallHint()`)

Add `help.go` in the same package. It exports:

```go
// PrintHelp writes the full --help output (banner + formatted help text) to w.
// prefix is the detected invoke prefix for the Usage section.
func PrintHelp(w io.Writer, prefix string)
```

---

## 5. BOT Border Fix (from US-001 tester observation)

The US-001 tester noted in `progress.txt`:

> Minor observation: BOT border corners use (U+2558/U+2559) instead of (U+255A/U+255B) as in quality-gate panel.tsx.

In `panel.go` line 23, the current code is:

```go
BOT = C.Dim + "\u2558" + strings.Repeat("\u2550", IW) + "\u2559" + C.Rst
```

Change to:

```go
BOT = C.Dim + "\u255A" + strings.Repeat("\u2550", IW) + "\u255B" + C.Rst
```

| Current | Char | Name                                  | Should be | Char | Name                             |
| ------- | ---- | ------------------------------------- | --------- | ---- | -------------------------------- |
| U+2558  | ╘    | BOX DRAWINGS UP LIGHT AND LEFT LIGHT  | U+255A    | ╚    | BOX DRAWINGS DOUBLE UP AND LEFT  |
| U+2559  | ╙    | BOX DRAWINGS UP LIGHT AND RIGHT LIGHT | U+255B    | ╝    | BOX DRAWINGS DOUBLE UP AND RIGHT |

The correct characters (`╚` U+255A, `╝` U+255B) are "double" variants that match TOP (`╔` U+2554, `╗` U+2557) and MID (`╠` U+2560, `╣` U+2563). The current ones are "light" variants that visually mismatch the other borders.

**Include this fix in the US-002 changeset** since it was noted by the tester but was not blocking for US-001.

---

## 6. Detailed PrintHelp Output Specification

### Output structure (line by line, with color annotations)

```
[gradient banner from ColorizeBanner()]
[blank line]
[C.Wht]AgentILS Logger[C.Rst]
[blank line]
[C.Wht]Usage:[C.Rst]
    [C.Grn]<prefix> serve [flags][C.Rst]
    [C.Grn]<prefix> read [flags][C.Rst]
[blank line]
[C.Wht]Commands:[C.Rst]
    [C.Grn]serve[C.Rst]              [C.Gry]Start HTTP log collector (default)[C.Rst]
    [C.Grn]read[C.Rst]               [C.Gry]Query and read JSONL log files[C.Rst]
[blank line]
[C.Wht]Serve Options:[C.Rst]
    [C.Grn]--host <addr>[C.Rst]      [C.Gry]HTTP bind host (default: 127.0.0.1)[C.Rst]
    [C.Grn]--port <num>[C.Rst]       [C.Gry]HTTP bind port (default: 12138)[C.Rst]
    [C.Grn]--log-dir <path>[C.Rst]   [C.Gry]JSONL output directory[C.Rst]
    [C.Grn]--file-prefix <s>[C.Rst]  [C.Gry]Default file prefix for JSONL files (default: agent-ils)[C.Rst]
    [C.Grn]--json[C.Rst]             [C.Gry]Output startup info as JSON[C.Rst]
    [C.Grn]--silent[C.Rst]           [C.Gry]Suppress startup output[C.Rst]
[blank line]
[C.Wht]Read Options:[C.Rst]
    [C.Grn]--tail <n>[C.Rst]         [C.Gry]Number of recent records (default: 50)[C.Rst]
    [C.Grn]--from <time>[C.Rst]      [C.Gry]Start time filter (ISO, epoch ms, or 10m/2h/1d)[C.Rst]
    [C.Grn]--to <time>[C.Rst]        [C.Gry]End time filter[C.Rst]
    [C.Grn]--source <s>[C.Rst]       [C.Gry]Filter by source field[C.Rst]
    [C.Grn]--level <s>[C.Rst]        [C.Gry]Filter by level field (case-insensitive)[C.Rst]
    [C.Grn]--event <s>[C.Rst]        [C.Gry]Filter by event field[C.Rst]
    [C.Grn]--format <fmt>[C.Rst]     [C.Gry]Output format: text, json, jsonl (default: text)[C.Rst]
[blank line]
[C.Wht]Examples:[C.Rst]
    [C.Gry]agent-ils-logger serve[C.Rst]
    [C.Gry]agent-ils-logger serve --port 8080[C.Rst]
    [C.Gry]agent-ils-logger read --tail 50[C.Rst]
    [C.Gry]agent-ils-logger read --from 10m --format json[C.Rst]
    [C.Gry]npx @agent-ils/logger serve[C.Rst]
```

All output goes to `io.Writer` (which will be `os.Stderr`), consistent with the US-001 convention of outputting to stderr.

### Implementation approach

Use structured Go data for clean rendering:

```go
type helpSection struct {
    Title string        // e.g. "Usage:", "Commands:"
    Lines []helpLine    // nil means section has raw indented text lines
}

type helpLine struct {
    Label       string  // e.g. "serve", "--host <addr>"
    Description string  // e.g. "Start HTTP log collector (default)"; empty for Usage/Examples lines
}
```

Then `PrintHelp()` iterates sections, applying `C.Wht`/`C.Grn`/`C.Gry` colors guarded by `supportsANSI()`.

---

## 7. Acceptance Criteria Mapping

| #   | AC                                                                                   | Implementation Detail                                                                    |
| --- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 1   | `--help` / `-h` outputs Banner (gradient) + blank line + help                        | `PrintHelp()` calls `ColorizeBanner()` then renders structured help sections             |
| 2   | Help format matches quality-gate: Usage/Commands/Options/Examples sections           | Sections rendered in exact order with proper labels and spacing                          |
| 3   | Usage line uses detected invokePrefix                                                | `detectSubcommand()` calls `DetectInvoker()` + `InvokePrefix()`, passes to `PrintHelp()` |
| 4   | Help text uses ANSI colors: title=bright white, labels=green, description=light gray | Color constants `C.Wht`, `C.Grn`, `C.Gry`; guarded by `supportsANSI()`                   |
| 5   | No longer uses Go flag package's `PrintDefaults()`                                   | `--help` intercepted before `fs.Parse()`; `fs.Usage` overrides removed                   |
| 6   | go build succeeds, go vet passes                                                     | Zero external deps, stdlib only                                                          |

---

## 8. Files to Change

| File                       | Change                                                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `internal/banner/help.go`  | **NEW** -- `PrintHelp(w io.Writer, prefix string)` with structured help rendering + ANSI colors                                                                                      |
| `internal/banner/panel.go` | Fix BOT border: `\u2558\u2559` -> `\u255A\u255B` (line 23)                                                                                                                           |
| `main.go`                  | 1) In `detectSubcommand()`, intercept `--help`/`-h` and call `banner.PrintHelp(os.Stderr, prefix)` + `os.Exit(0)`. 2) Remove `fs.Usage` overrides from `runServe()` and `runRead()`. |
