package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"strings"

	"github.com/bugfix2020/AgentILS/packages/logger-collector/internal/query"
	"github.com/bugfix2020/AgentILS/packages/logger-collector/internal/server"
)

// version is set at build time via -ldflags "-X main.version=...".
// Defaults to "dev" when running locally (go build / go run).
var version = "dev"

func main() {
	// Subcommand routing: detect which subcommand to use
	args := os.Args[1:]
	subcommand := detectSubcommand(args)

	switch subcommand {
	case "serve":
		runServe(args)
	case "read":
		runRead(args)
	default:
		runServe(args)
	}
}

// readFlags is the set of flags that indicate the read subcommand.
var readFlags = map[string]bool{
	"--tail":   true,
	"--from":   true,
	"--to":     true,
	"--format": true,
}

// detectSubcommand replicates Node's normalizeArgs logic:
// - If args is empty, default to "serve"
// - If first arg is not a flag (doesn't start with -), it's the subcommand
// - If first arg is a flag and any read-specific flag is present, route to "read"
// - Otherwise route to "serve"
func detectSubcommand(args []string) string {
	if len(args) == 0 {
		return "serve"
	}
	for _, arg := range args {
		if arg == "--version" || arg == "-v" {
			fmt.Printf("agent-ils-logger %s\n", version)
			os.Exit(0)
		}
		if arg == "--help" || arg == "-h" {
			return "serve" // will be handled by flag package
		}
	}
	first := args[0]
	if !strings.HasPrefix(first, "-") {
		return first
	}
	// First arg is a flag; check for read-specific flags
	for _, arg := range args {
		if readFlags[arg] {
			return "read"
		}
	}
	return "serve"
}

func runServe(args []string) {
	fs := flag.NewFlagSet("serve", flag.ExitOnError)
	host := fs.String("host", "127.0.0.1", "HTTP bind host")
	port := fs.Int("port", 12138, "HTTP bind port")
	logDir := fs.String("log-dir", "", "JSONL output directory (default: <cwd>/.agent-ils/logger/logs)")
	filePrefix := fs.String("file-prefix", "agent-ils", "Default file prefix for JSONL files")
	jsonOutput := fs.Bool("json", false, "Output startup info as JSON")
	silentOutput := fs.Bool("silent", false, "Suppress startup output")
	cwd := fs.String("cwd", "", "Project root for resolving relative paths")

	fs.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: %s serve [flags]\n\nFlags:\n", os.Args[0])
		fs.PrintDefaults()
	}

	fs.Parse(filterSubcommandArgs(args, "serve"))

	// Resolve cwd
	effectiveCwd := *cwd
	if effectiveCwd == "" {
		wd, err := os.Getwd()
		if err != nil {
			fmt.Fprintf(os.Stderr, "error getting working directory: %v\n", err)
			os.Exit(1)
		}
		effectiveCwd = wd
	}

	// Resolve logDir
	effectiveLogDir := query.ResolveEffectiveLogDir(effectiveCwd, *logDir)

	srv := server.New(*host, *port, effectiveLogDir, *filePrefix)

	ctx := context.Background()
	if err := srv.Start(ctx, *jsonOutput, *silentOutput); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}

func runRead(args []string) {
	fs := flag.NewFlagSet("read", flag.ExitOnError)
	tail := fs.Int("tail", 50, "Number of most recent records to return")
	from := fs.String("from", "", "Start time filter (ISO, epoch ms, or relative like 10m)")
	to := fs.String("to", "", "End time filter")
	source := fs.String("source", "", "Filter by source field (exact match)")
	level := fs.String("level", "", "Filter by level field (case-insensitive match)")
	event := fs.String("event", "", "Filter by event field (exact match)")
	format := fs.String("format", "text", "Output format: text, json, jsonl")
	logDir := fs.String("log-dir", "", "Directory containing JSONL files")
	cwd := fs.String("cwd", "", "Project root for resolving relative paths")

	fs.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: %s read [flags]\n\nFlags:\n", os.Args[0])
		fs.PrintDefaults()
	}

	fs.Parse(filterSubcommandArgs(args, "read"))

	// Resolve cwd
	effectiveCwd := *cwd
	if effectiveCwd == "" {
		wd, err := os.Getwd()
		if err != nil {
			fmt.Fprintf(os.Stderr, "error getting working directory: %v\n", err)
			os.Exit(1)
		}
		effectiveCwd = wd
	}

	opts := query.ReadOptions{
		Cwd:    effectiveCwd,
		LogDir: *logDir,
		Tail:   *tail,
		From:   *from,
		To:     *to,
		Source: *source,
		Level:  *level,
		Event:  *event,
		Format: *format,
	}

	records, err := query.ReadLogRecords(opts)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}

	output := query.FormatLogRecords(records, opts.Format)
	fmt.Println(output)
}

// filterSubcommandArgs removes the subcommand name from args if present.
func filterSubcommandArgs(args []string, subcmd string) []string {
	// If the args contain an explicit subcommand name, strip it
	for i, arg := range args {
		if arg == subcmd && (i == 0 || !strings.HasPrefix(args[0], "-")) {
			return append(args[:i], args[i+1:]...)
		}
	}
	return args
}
