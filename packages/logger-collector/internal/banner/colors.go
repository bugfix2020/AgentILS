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

// padOrTruncate ensures the visible width of s equals w.
// If s is shorter, it pads with spaces. If s is longer, it truncates.
func padOrTruncate(s string, w int) string {
	// Strip ANSI codes, build visible rune slice
	clean := ansiRe.ReplaceAllString(s, "")
	runes := []rune(clean)
	if len(runes) > w {
		// Need to truncate — rebuild with ANSI codes preserved up to w visible chars
		return truncateVisible(s, w)
	}
	if len(runes) < w {
		return s + strings.Repeat(" ", w-len(runes))
	}
	return s
}

// truncateVisible truncates s to at most w visible (non-ANSI) characters.
func truncateVisible(s string, w int) string {
	var result []rune
	visible := 0
	inEscape := false
	for _, r := range s {
		if r == '\x1b' {
			inEscape = true
			result = append(result, r)
			continue
		}
		if inEscape {
			result = append(result, r)
			if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') {
				inEscape = false
			}
			continue
		}
		if visible >= w {
			break
		}
		result = append(result, r)
		visible++
	}
	// Pad if needed
	for visible < w {
		result = append(result, ' ')
		visible++
	}
	return string(result)
}

