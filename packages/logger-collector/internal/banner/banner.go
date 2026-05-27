package banner

import (
	"os"
	"strings"
)

// asciiBanner is the 6-line AgentILS ASCII art, verbatim from
// packages/quality-gate/templates/banner.txt.
const asciiBanner = `     ___     _____  ______  __   _  _______  _____  __       _____
    / _ \   / ____||  ____||  \ | ||__   __||_   _|| |     / ____|
   / /_\ \ | |  __ | |__   |   \| |   | |     | |  | |    | (___
  / ___  \ | | |_ ||  __|  | |\   |   | |     | |  | |     \___ \
 / /   \  \| |__| || |____ | | \  |   | |    _| |_ | |____ ____) |
/_/     \__\\_____||______||_|  \_|   |_|   |_____||______|_____/`

// supportsANSI returns true if the terminal supports ANSI escape sequences.
func supportsANSI() bool {
	fi, err := os.Stderr.Stat()
	if err != nil {
		return false
	}
	if fi.Mode()&os.ModeCharDevice == 0 {
		return false
	}
	if os.Getenv("NO_COLOR") != "" {
		return false
	}
	if os.Getenv("TERM") == "dumb" {
		return false
	}
	return true
}

// ColorizeBanner applies the 5-color gradient to the ASCII banner.
// Spaces are left bare; every non-space character gets its own color + reset.
func ColorizeBanner() string {
	if !supportsANSI() {
		return asciiBanner
	}
	lines := strings.Split(asciiBanner, "\n")
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
			idx := int(float64(j) / float64(maxInt(lineLen-1, 1)) * float64(len(bannerColors)-1))
			sb.WriteString(bannerColors[idx])
			sb.WriteRune(ch)
			sb.WriteString("\x1b[0m")
		}
	}
	return sb.String()
}

// maxInt returns the larger of a and b.
func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
