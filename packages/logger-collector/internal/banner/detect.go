package banner

import (
	"os"
	"runtime"
	"strings"
)

// DetectInvoker returns the invocation mode: "npx", "gorun", or "binary".
func DetectInvoker() string {
	if os.Getenv("AGENT_ILS_INVOKER") == "npx" {
		return "npx"
	}
	if strings.Contains(os.Args[0], "go-build") {
		return "gorun"
	}
	return "binary"
}

// InvokePrefix returns the command prefix for the given invocation mode.
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

// InstallHint returns a platform-specific installation hint.
// Only meaningful for binary mode; callers should not use this for npx/gorun.
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
