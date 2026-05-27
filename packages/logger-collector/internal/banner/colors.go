package banner

import (
	"regexp"
	"strings"
	"unicode/utf8"
)

// IW is the inner width of the ECAM panel, matching quality-gate.
const IW = 60

// C holds the ANSI color constants, matching the ECAM panel in quality-gate.
var C = struct {
	Grn, Brt, Amb, Wht, Cyn, Dim, Red, Gry, Rst string
}{
	Grn: "\x1b[32m",
	Brt: "\x1b[1;32m",
	Amb: "\x1b[33m",
	Wht: "\x1b[1;37m",
	Cyn: "\x1b[36m",
	Dim: "\x1b[2;32m",
	Red: "\x1b[31m",
	Gry: "\x1b[90m",
	Rst: "\x1b[0m",
}

// bannerColors is the 5-stop gradient used for the ASCII banner (xterm-256).
var bannerColors = [5]string{
	"\x1b[38;5;75m",
	"\x1b[38;5;105m",
	"\x1b[38;5;141m",
	"\x1b[38;5;175m",
	"\x1b[38;5;204m",
}

// ansiRe is the compiled regex for stripping ANSI escape sequences.
var ansiRe = regexp.MustCompile(`\x1b\[[0-9;]*m`)

// visLen returns the visible (non-ANSI) length of a string.
func visLen(s string) int {
	return utf8.RuneCountInString(ansiRe.ReplaceAllString(s, ""))
}

// padVisible pads s with trailing spaces so its visible width equals w.
func padVisible(s string, w int) string {
	vl := visLen(s)
	if vl >= w {
		return s
	}
	return s + strings.Repeat(" ", w-vl)
}

