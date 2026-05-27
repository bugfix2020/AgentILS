package jsonl

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/bugfix2020/AgentILS/packages/logger-collector/internal/payload"
)

const defaultFilePrefix = "agent-ils"

var (
	nonAlphaNum = regexp.MustCompile(`[^a-zA-Z0-9_.\-]`)
	leadingDots = regexp.MustCompile(`^\.+`)
	fileMu      sync.Mutex
)

// LogFileName replicates the Node collector's logFileName function exactly.
// defaultPrefix is typically "agent-ils".
func LogFileName(defaultPrefix string, p *payload.HttpLogPayload, source string, ts string) string {
	if p.FileName != nil && *p.FileName != "" {
		return EnsureJSONL(SanitizeFileName(*p.FileName))
	}

	prefix := ""
	if p.FilePrefix != nil && *p.FilePrefix != "" {
		prefix = *p.FilePrefix
	} else {
		if source == "unknown" {
			prefix = defaultPrefix
		} else {
			prefix = defaultPrefix + "-" + source
		}
	}

	// ts[:10] extracts the date portion YYYY-MM-DD
	dateStr := ts
	if len(dateStr) > 10 {
		dateStr = dateStr[:10]
	}

	return SanitizeFilePart(prefix) + "-" + dateStr + ".jsonl"
}

// SanitizeFileName replicates the Node collector's sanitizeFileName.
// Split on / or \, take last segment, then sanitize.
func SanitizeFileName(fileName string) string {
	// Split on both / and \
	base := fileName
	if idx := strings.LastIndexAny(fileName, "/\\"); idx >= 0 {
		base = fileName[idx+1:]
	}
	return SanitizeFilePart(base)
}

// SanitizeFilePart replicates the Node collector's sanitizeFilePart.
// Trim whitespace, replace non-alphanumeric (except _.-) with _, strip leading dots.
func SanitizeFilePart(value string) string {
	s := strings.TrimSpace(value)
	s = nonAlphaNum.ReplaceAllString(s, "_")
	s = leadingDots.ReplaceAllString(s, "")
	if s == "" {
		return defaultFilePrefix
	}
	return s
}

// EnsureJSONL ensures the filename ends with .jsonl.
func EnsureJSONL(fileName string) string {
	if strings.HasSuffix(fileName, ".jsonl") {
		return fileName
	}
	return fileName + ".jsonl"
}

// WriteRecord writes a single JSONL record to the appropriate file.
// It returns the record with the fileName field populated.
// The seq is the sequence number (already incremented).
// The pid is the process ID.
func WriteRecord(logDir string, defaultPrefix string, p *payload.HttpLogPayload, seq int64, pid int) (*payload.JsonlLogRecord, error) {
	ts := ""
	if p.Ts != nil && *p.Ts != "" {
		ts = *p.Ts
	} else {
		ts = time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	}

	source := "unknown"
	if p.Source != nil && *p.Source != "" {
		source = *p.Source
	}

	fileName := LogFileName(defaultPrefix, p, source, ts)

	namespace := source
	if p.Namespace != nil && *p.Namespace != "" {
		namespace = *p.Namespace
	}

	level := "info"
	if p.Level != nil {
		switch *p.Level {
		case "debug", "info", "warn", "error":
			level = *p.Level
		}
	}

	message := ""
	if p.Message != nil {
		message = *p.Message
	}

	fields := map[string]interface{}{}
	if p.Fields != nil {
		fields = p.Fields
	}

	event := ""
	if p.Event != nil {
		event = *p.Event
	}

	traceID := ""
	if p.TraceID != nil {
		traceID = *p.TraceID
	}

	record := &payload.JsonlLogRecord{
		Ts:        ts,
		Seq:       seq,
		Pid:       pid,
		Source:    source,
		Namespace: namespace,
		Level:     level,
		Message:   message,
		Fields:    fields,
		FileName:  fileName,
	}
	if event != "" {
		record.Event = event
	}
	if traceID != "" {
		record.TraceID = traceID
	}

	// Serialize record to JSON line
	line, err := json.Marshal(record)
	if err != nil {
		return nil, err
	}

	// Write to file under lock to prevent interleaved lines
	fileMu.Lock()
	defer fileMu.Unlock()

	if err := os.MkdirAll(logDir, 0755); err != nil {
		return nil, err
	}

	f, err := os.OpenFile(filepath.Join(logDir, fileName), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	if _, err := f.Write(append(line, '\n')); err != nil {
		return nil, err
	}

	return record, nil
}
