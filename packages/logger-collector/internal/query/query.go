package query

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	defaultLimit  = 50
	maxFieldChars = 600
)

var relativeTimeRe = regexp.MustCompile(`(?i)^(\d+)(ms|s|m|h|d|w)$`)

// timeUnitMs maps time unit suffixes to milliseconds.
var timeUnitMs = map[string]int64{
	"ms": 1,
	"s":  1000,
	"m":  60000,
	"h":  3600000,
	"d":  86400000,
	"w":  604800000,
}

// ReadableLogRecord matches the Node ReadableLogRecord interface.
// Fields that may be absent use pointer types.
type ReadableLogRecord struct {
	Ts        string      `json:"ts"`
	Seq       *int64      `json:"seq,omitempty"`
	Pid       *int        `json:"pid,omitempty"`
	Source    string      `json:"source"`
	Namespace *string     `json:"namespace,omitempty"`
	Level     string      `json:"level"`
	Event     *string     `json:"event,omitempty"`
	Message   string      `json:"message"`
	Fields    interface{} `json:"fields,omitempty"`
	TraceID   *string     `json:"traceId,omitempty"`
	FileName  *string     `json:"fileName,omitempty"`
}

// ReadOptions holds all CLI flags for the read subcommand.
type ReadOptions struct {
	Cwd    string
	LogDir string
	Tail   int
	From   string
	To     string
	Source string
	Level  string
	Event  string
	Format string
}

// parseLogLine parses a single JSONL line into a ReadableLogRecord.
// Returns nil if the line is blank, fails JSON parse, or lacks ts/level.
func parseLogLine(line string, fileName string) *ReadableLogRecord {
	var parsed map[string]interface{}
	if err := json.Unmarshal([]byte(line), &parsed); err != nil {
		return nil
	}

	tsVal, _ := parsed["ts"].(string)
	levelVal, _ := parsed["level"].(string)
	if tsVal == "" || levelVal == "" {
		return nil
	}

	rec := &ReadableLogRecord{
		Ts:      tsVal,
		Level:   levelVal,
		Source:  "unknown",
		Message: "",
	}

	if v, ok := parsed["seq"]; ok {
		switch n := v.(type) {
		case float64:
			iv := int64(n)
			rec.Seq = &iv
		case json.Number:
			iv, _ := n.Int64()
			rec.Seq = &iv
		}
	}

	if v, ok := parsed["pid"]; ok {
		switch n := v.(type) {
		case float64:
			iv := int(n)
			rec.Pid = &iv
		case json.Number:
			iv, _ := n.Int64()
			iv2 := int(iv)
			rec.Pid = &iv2
		}
	}

	if v, ok := parsed["source"].(string); ok && v != "" {
		rec.Source = v
	}

	if v, ok := parsed["namespace"].(string); ok && v != "" {
		rec.Namespace = &v
	}

	if v, ok := parsed["event"].(string); ok && v != "" {
		rec.Event = &v
	}

	if v, ok := parsed["message"].(string); ok {
		rec.Message = v
	}

	if v, ok := parsed["fields"]; ok && v != nil {
		rec.Fields = v
	}

	if v, ok := parsed["traceId"].(string); ok && v != "" {
		rec.TraceID = &v
	}

	if v, ok := parsed["fileName"].(string); ok && v != "" {
		rec.FileName = &v
	} else {
		rec.FileName = &fileName
	}

	return rec
}

// parseTimeInput replicates Node's parseTimeInput exactly.
// Returns nil if input is empty/undefined.
func parseTimeInput(input string) (*time.Time, error) {
	if input == "" {
		return nil, nil
	}

	value := strings.TrimSpace(input)

	// Try relative time: 10m, 2h, 1d, 30s, 500ms, 1w
	if m := relativeTimeRe.FindStringSubmatch(value); m != nil {
		amount, _ := strconv.ParseInt(m[1], 10, 64)
		unit := strings.ToLower(m[2])
		mult := timeUnitMs[unit]
		now := time.Now().UTC()
		result := now.Add(-time.Duration(amount*mult) * time.Millisecond)
		return &result, nil
	}

	// Pure digits: epoch milliseconds
	if isPureDigits(value) {
		ms, err := strconv.ParseInt(value, 10, 64)
		if err != nil {
			return nil, fmt.Errorf("Invalid time value: %s", input)
		}
		result := time.UnixMilli(ms)
		if result.IsZero() && ms != 0 {
			return nil, fmt.Errorf("Invalid time value: %s", input)
		}
		return &result, nil
	}

	// Try ISO timestamp formats
	// Node writes: 2006-01-02T15:04:05.000Z (3-decimal ms)
	formats := []string{
		"2006-01-02T15:04:05.000Z",
		time.RFC3339Nano,
		time.RFC3339,
	}
	for _, layout := range formats {
		if t, err := time.Parse(layout, value); err == nil {
			return &t, nil
		}
	}

	return nil, fmt.Errorf("Invalid time value: %s", input)
}

func isPureDigits(s string) bool {
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return len(s) > 0
}

// timestampMs replicates Node's timestampMs: parse ts via Date, return ms or 0.
func timestampMs(ts string) int64 {
	// Try formats the collector writes
	formats := []string{
		"2006-01-02T15:04:05.000Z",
		time.RFC3339Nano,
		time.RFC3339,
	}
	for _, layout := range formats {
		if t, err := time.Parse(layout, ts); err == nil {
			return t.UnixMilli()
		}
	}
	return 0
}

// normalizeLimit replicates Node's normalizeLimit.
func normalizeLimit(limit int) int {
	if limit <= 0 {
		return defaultLimit
	}
	return limit
}

// listJsonlFiles lists all .jsonl files in logDir, sorted alphabetically.
// Returns empty slice if logDir doesn't exist or isn't a directory.
func listJsonlFiles(logDir string) []string {
	info, err := os.Stat(logDir)
	if err != nil || !info.IsDir() {
		return nil
	}

	entries, err := os.ReadDir(logDir)
	if err != nil {
		return nil
	}

	var files []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".jsonl") {
			files = append(files, e.Name())
		}
	}
	sort.Strings(files)
	return files
}

// matchesRecord checks time range filters.
func matchesRecord(rec *ReadableLogRecord, from *time.Time, to *time.Time) bool {
	ts := timestampMs(rec.Ts)
	if from != nil && ts < from.UnixMilli() {
		return false
	}
	if to != nil && ts > to.UnixMilli() {
		return false
	}
	return true
}

// matchesExtraFilters applies --source, --level, --event filters.
func matchesExtraFilters(rec *ReadableLogRecord, source, level, event string) bool {
	if source != "" && rec.Source != source {
		return false
	}
	if level != "" && !strings.EqualFold(rec.Level, level) {
		return false
	}
	if event != "" {
		if rec.Event == nil || *rec.Event != event {
			return false
		}
	}
	return true
}

// ReadLogRecords replicates Node's readLogRecords exactly.
func ReadLogRecords(opts ReadOptions) ([]*ReadableLogRecord, error) {
	// Resolve logDir
	logDir := resolveLogDir(opts.Cwd, opts.LogDir)

	// List files
	files := listJsonlFiles(logDir)

	// Parse time range
	from, err := parseTimeInput(opts.From)
	if err != nil {
		return nil, err
	}
	to, err := parseTimeInput(opts.To)
	if err != nil {
		return nil, err
	}

	// Read and parse all records
	records := make([]*ReadableLogRecord, 0)
	for _, fileName := range files {
		data, err := os.ReadFile(filepath.Join(logDir, fileName))
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(data), "\n") {
			trimmed := strings.TrimSpace(line)
			if trimmed == "" {
				continue
			}
			rec := parseLogLine(trimmed, fileName)
			if rec == nil {
				continue
			}
			if !matchesRecord(rec, from, to) {
				continue
			}
			if !matchesExtraFilters(rec, opts.Source, opts.Level, opts.Event) {
				continue
			}
			records = append(records, rec)
		}
	}

	// Determine limit
	limit := normalizeLimit(opts.Tail)
	hasTimeRange := opts.From != "" || opts.To != ""

	// Sort DESC by timestamp
	sort.Slice(records, func(i, j int) bool {
		return timestampMs(records[i].Ts) > timestampMs(records[j].Ts)
	})

	// Take first limit records
	if limit < len(records) {
		records = records[:limit]
	}

	// If time range was specified, re-sort ASC
	if hasTimeRange {
		sort.Slice(records, func(i, j int) bool {
			return timestampMs(records[i].Ts) < timestampMs(records[j].Ts)
		})
	}

	return records, nil
}

// resolveLogDir replicates Node's resolveLoggerPaths for logDir.
func resolveLogDir(cwd string, logDir string) string {
	if cwd == "" {
		cwd, _ = os.Getwd()
	}
	if logDir == "" {
		return filepath.Join(cwd, ".agent-ils", "logger", "logs")
	}
	if filepath.IsAbs(logDir) {
		return logDir
	}
	return filepath.Join(cwd, logDir)
}

// FormatLogRecords replicates Node's formatLogRecords.
func FormatLogRecords(records []*ReadableLogRecord, format string) string {
	switch format {
	case "json":
		return formatJSON(records)
	case "jsonl":
		return formatJSONL(records)
	default:
		return formatText(records)
	}
}

func formatText(records []*ReadableLogRecord) string {
	if len(records) == 0 {
		return "No log records found."
	}
	lines := make([]string, len(records))
	for i, rec := range records {
		lines[i] = formatRecordSummary(rec, true)
	}
	return strings.Join(lines, "\n")
}

func formatJSON(records []*ReadableLogRecord) string {
	data, _ := json.MarshalIndent(records, "", "  ")
	return string(data)
}

func formatJSONL(records []*ReadableLogRecord) string {
	lines := make([]string, len(records))
	for i, rec := range records {
		data, _ := json.Marshal(rec)
		lines[i] = string(data)
	}
	return strings.Join(lines, "\n")
}

// formatRecordSummary replicates Node's formatRecordSummary exactly.
func formatRecordSummary(rec *ReadableLogRecord, includeFields bool) string {
	var sb strings.Builder

	sb.WriteString("[")
	sb.WriteString(rec.Ts)
	sb.WriteString("] ")

	sb.WriteString(strings.ToUpper(rec.Level))

	sb.WriteString(" ")
	sb.WriteString(rec.Source)

	if rec.Event != nil && *rec.Event != "" {
		sb.WriteString(" ")
		sb.WriteString(*rec.Event)
	}

	if rec.TraceID != nil && *rec.TraceID != "" {
		sb.WriteString(" trace=")
		sb.WriteString(*rec.TraceID)
	}

	sb.WriteString(" ")
	sb.WriteString(rec.Message)

	if includeFields && rec.Fields != nil {
		fieldsJSON, err := json.Marshal(rec.Fields)
		if err == nil {
			s := string(fieldsJSON)
			truncated := truncate(s, maxFieldChars)
			sb.WriteString(" ")
			sb.WriteString(truncated)
		}
	}

	return strings.TrimSpace(sb.String())
}

// truncate replicates Node's truncate function.
func truncate(value string, maxLength int) string {
	if len(value) <= maxLength {
		return value
	}
	// Node does: value.slice(0, maxLength - 1) + "..."
	// Note: slice operates on UTF-16 code units in JS, but for ASCII JSON this matches.
	return value[:maxLength-1] + "..."
}

// ResolveEffectiveLogDir is exported for main.go usage.
func ResolveEffectiveLogDir(cwd string, logDir string) string {
	return resolveLogDir(cwd, logDir)
}
