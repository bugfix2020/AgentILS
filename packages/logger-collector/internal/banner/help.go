package banner

import (
	"fmt"
	"io"
)

// helpSection represents a titled block in the help output.
type helpSection struct {
	Title string     // e.g. "Usage:", "Commands:", "Serve Options:"
	Lines []helpLine // structured lines within the section
}

// helpLine represents a single line within a help section.
// For Usage/Examples, only Label is used. For Commands/Options, both Label and Description are used.
type helpLine struct {
	Label       string // e.g. "serve", "--host <addr>"
	Description string // e.g. "Start HTTP log collector (default)"; empty for usage/example lines
}

// helpSections defines the full help content in display order.
func helpSections(prefix string) []helpSection {
	return []helpSection{
		{
			Title: "Usage:",
			Lines: []helpLine{
				{Label: prefix + " serve [flags]"},
				{Label: prefix + " read [flags]"},
			},
		},
		{
			Title: "Commands:",
			Lines: []helpLine{
				{Label: "serve", Description: "Start HTTP log collector (default)"},
				{Label: "read", Description: "Query and read JSONL log files"},
			},
		},
		{
			Title: "Serve Options:",
			Lines: []helpLine{
				{Label: "--host <addr>", Description: "HTTP bind host (default: 127.0.0.1)"},
				{Label: "--port <num>", Description: "HTTP bind port (default: 12138)"},
				{Label: "--log-dir <path>", Description: "JSONL output directory"},
				{Label: "--file-prefix <s>", Description: "Default file prefix for JSONL files (default: agent-ils)"},
				{Label: "--json", Description: "Output startup info as JSON"},
				{Label: "--silent", Description: "Suppress startup output"},
			},
		},
		{
			Title: "Read Options:",
			Lines: []helpLine{
				{Label: "--tail <n>", Description: "Number of recent records (default: 50)"},
				{Label: "--from <time>", Description: "Start time filter (ISO, epoch ms, or 10m/2h/1d)"},
				{Label: "--to <time>", Description: "End time filter"},
				{Label: "--source <s>", Description: "Filter by source field"},
				{Label: "--level <s>", Description: "Filter by level field (case-insensitive)"},
				{Label: "--event <s>", Description: "Filter by event field"},
				{Label: "--format <fmt>", Description: "Output format: text, json, jsonl (default: text)"},
			},
		},
		{
			Title: "Examples:",
			Lines: []helpLine{
				{Label: "agent-ils-logger serve"},
				{Label: "agent-ils-logger serve --port 8080"},
				{Label: "agent-ils-logger read --tail 50"},
				{Label: "agent-ils-logger read --from 10m --format json"},
				{Label: "npx @agent-ils/logger serve"},
			},
		},
	}
}

// labelWidth returns the column width for the label area so descriptions align.
// Only sections with descriptions (Commands, Serve Options, Read Options) affect alignment.
func labelWidth(sections []helpSection) int {
	w := 0
	for _, sec := range sections {
		for _, ln := range sec.Lines {
			if ln.Description != "" {
				// "    " prefix + label text
				lw := 4 + len(ln.Label)
				if lw > w {
					w = lw
				}
			}
		}
	}
	// Add minimum gap between label and description
	return w + 2
}

// PrintHelp writes the full --help output (banner + formatted help text) to w.
// prefix is the detected invoke prefix for the Usage section.
func PrintHelp(w io.Writer, prefix string) {
	// Gradient banner
	fmt.Fprintln(w, ColorizeBanner())
	fmt.Fprintln(w)

	// Title line
	title := "AgentILS Logger"
	if supportsANSI() {
		title = C.Wht + title + C.Rst
	}
	fmt.Fprintln(w, title)
	fmt.Fprintln(w)

	sections := helpSections(prefix)
	lw := labelWidth(sections)

	for i, sec := range sections {
		// Section title
		secTitle := sec.Title
		if supportsANSI() {
			secTitle = C.Wht + secTitle + C.Rst
		}
		fmt.Fprintln(w, secTitle)

		for _, ln := range sec.Lines {
			if ln.Description != "" {
				// Structured line: indented label + padded + description
				label := "    " + ln.Label
				if supportsANSI() {
					label = "    " + C.Grn + ln.Label + C.Rst
				}
				paddedLabel := padVisible(label, lw)
				desc := ln.Description
				if supportsANSI() {
					desc = C.Gry + ln.Description + C.Rst
				}
				fmt.Fprintln(w, paddedLabel+desc)
			} else {
				// Plain indented line (Usage / Examples)
				text := "    " + ln.Label
				if supportsANSI() {
					text = "    " + C.Grn + ln.Label + C.Rst
				}
				fmt.Fprintln(w, text)
			}
		}

		// Blank line between sections (but not after the last one)
		if i < len(sections)-1 {
			fmt.Fprintln(w)
		}
	}
}
