package banner

import (
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

// ServerParams holds the dynamic values rendered in the ECAM info panel.
type ServerParams struct {
	Version     string
	Endpoint    string
	LogDir      string
	ReadCmd     string
	InstallHint string // empty string means "don't show install row"
}

// Box-drawing borders -- all use C.Dim (dim green) for border characters.
var (
	TOP = C.Dim + "\u2554" + strings.Repeat("\u2550", IW) + "\u2557" + C.Rst
	MID = C.Dim + "\u2560" + strings.Repeat("\u2550", IW) + "\u2563" + C.Rst
	BOT = C.Dim + "\u2558" + strings.Repeat("\u2550", IW) + "\u2559" + C.Rst
)

// rowLine wraps content between box-drawing vertical borders, padded to IW visible characters.
func rowLine(content string) string {
	padded := padVisible(content, IW)
	return C.Dim + "\u2551" + C.Rst + padded + C.Dim + "\u2551" + C.Rst
}

// fitValue truncates val so that prefix+val fits within IW visible characters.
// prefix is assumed to be plain text. If the combined length exceeds IW,
// val is truncated with "..." appended.
func fitValue(prefix string, val string) string {
	prefixLen := len([]rune(prefix))
	available := IW - prefixLen
	if available < 4 {
		available = 4
	}
	runes := []rune(val)
	if len(runes) <= available {
		return val
	}
	return string(runes[:available-3]) + "..."
}

// PrintServer renders the full branded banner + ECAM info panel to w.
func PrintServer(w io.Writer, params ServerParams) {
	// Banner
	fmt.Fprintln(w, ColorizeBanner())
	fmt.Fprintln(w)

	// ECAM Panel
	fmt.Fprintln(w, TOP)

	// Header row
	header := "  " + C.Wht + "AGENTILS  LOGGER SERVICE" + C.Rst + " \u00b7 " + params.Version
	fmt.Fprintln(w, rowLine(header))

	fmt.Fprintln(w, MID)

	// Status row
	status := "  " + C.Brt + "\u25cf" + C.Rst + " server ready"
	fmt.Fprintln(w, rowLine(status))

	// Empty row
	fmt.Fprintln(w, rowLine(""))

	// Endpoint row
	epVal := fitValue("  endpoint   ", params.Endpoint)
	fmt.Fprintln(w, rowLine("  endpoint   " + epVal))

	// LogDir row
	ldVal := fitValue("  logDir     ", params.LogDir)
	fmt.Fprintln(w, rowLine("  logDir     " + ldVal))

	// Empty row
	fmt.Fprintln(w, rowLine(""))

	// Read row
	fmt.Fprintln(w, rowLine("  read       " + params.ReadCmd))

	// Install row(s) -- only if non-empty
	if params.InstallHint != "" {
		printInstallRows(w, params.InstallHint)
	}

	fmt.Fprintln(w, BOT)
}

// printInstallRows handles the install hint with wrapping for multi-part hints
// (e.g. brew: "brew tap ... && brew install ...") or truncation for long single-line hints.
func printInstallRows(w io.Writer, hint string) {
	const prefix = "  install    "
	const contPrefix = "             " // 13 spaces to align with the value area

	// Check if the hint contains " && " for line wrapping (brew case)
	if ampIdx := strings.Index(hint, " && "); ampIdx >= 0 {
		firstPart := hint[:ampIdx]    // e.g. "brew tap bugfix2020/agentils"
		secondPart := hint[ampIdx+4:] // e.g. "brew install agent-ils-logger"
		firstLine := prefix + firstPart + " &&"
		secondLine := contPrefix + secondPart
		fmt.Fprintln(w, rowLine(firstLine))
		fmt.Fprintln(w, rowLine(secondLine))
		return
	}

	// Single-line hint -- fit within row
	fittedVal := fitValue(prefix, hint)
	fmt.Fprintln(w, rowLine(prefix + fittedVal))
}

// PrintJSON outputs startup info as JSON (no banner) to w.
func PrintJSON(w io.Writer, params ServerParams) {
	obj := map[string]interface{}{
		"ok":       true,
		"endpoint": params.Endpoint,
		"logDir":   params.LogDir,
		"read":     params.ReadCmd,
	}
	if params.InstallHint != "" {
		obj["installHint"] = params.InstallHint
	}
	data, _ := json.Marshal(obj)
	fmt.Fprintln(w, string(data))
}
