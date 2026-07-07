package jsonl

import (
	"encoding/json"
	"fmt"
	"io"
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
	nonAlphaNum       = regexp.MustCompile(`[^a-zA-Z0-9_.\-]`)
	leadingDots       = regexp.MustCompile(`^\.+`)
	fileMu            sync.Mutex
	appendStateByFile = map[string]appendState{}
)

type appendState struct {
	nextLine    int
	needsPrefix bool
}

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
// It returns the record with file name and path:line metadata populated.
// The seq is the sequence number (already incremented).
// The pid is the process ID.
func WriteRecord(logDir string, defaultPrefix string, p *payload.HttpLogPayload, seq int64, pid int) (*payload.JsonlLogRecord, error) {
	return WriteRecordWithBaseDir(logDir, "", defaultPrefix, p, seq, pid)
}

func WriteRecordWithBaseDir(logDir string, displayBaseDir string, defaultPrefix string, p *payload.HttpLogPayload, seq int64, pid int) (*payload.JsonlLogRecord, error) {
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
	absLogDir, err := filepath.Abs(logDir)
	if err != nil {
		absLogDir = logDir
	}
	filePath := filepath.Join(absLogDir, fileName)

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

	// Write to file under lock to prevent interleaved lines
	fileMu.Lock()
	defer fileMu.Unlock()

	if err := os.MkdirAll(absLogDir, 0755); err != nil {
		return nil, err
	}

	lineNumber, prefix, err := nextJSONLAppend(filePath)
	if err != nil {
		return nil, err
	}
	relativePath := DisplayRelativePath(filePath, displayBaseDir)
	record := &payload.JsonlLogRecord{
		Ts:               ts,
		Seq:              seq,
		Pid:              pid,
		Source:           source,
		Namespace:        namespace,
		Level:            level,
		Message:          message,
		Fields:           fields,
		FileName:         fileName,
		FilePath:         filePath,
		RelativePath:     relativePath,
		Line:             lineNumber,
		Location:         fmt.Sprintf("%s:%d", filePath, lineNumber),
		RelativeLocation: fmt.Sprintf("%s:%d", relativePath, lineNumber),
	}
	if event != "" {
		record.Event = event
	}
	if traceID != "" {
		record.TraceID = traceID
	}

	// Serialize record to JSON line after location metadata is finalized.
	line, err := json.Marshal(record)
	if err != nil {
		return nil, err
	}

	f, err := os.OpenFile(filePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	if prefix != "" {
		if _, err := f.WriteString(prefix); err != nil {
			return nil, err
		}
	}
	if _, err := f.Write(append(line, '\n')); err != nil {
		return nil, err
	}
	markJSONLAppendCommitted(filePath)

	return record, nil
}

func nextJSONLAppend(filePath string) (int, string, error) {
	state, ok := appendStateByFile[filePath]
	if !ok {
		var err error
		state, err = readJSONLAppendState(filePath)
		if err != nil {
			return 0, "", err
		}
		appendStateByFile[filePath] = state
	}
	prefix := ""
	if state.needsPrefix {
		prefix = "\n"
	}
	return state.nextLine, prefix, nil
}

func markJSONLAppendCommitted(filePath string) {
	state, ok := appendStateByFile[filePath]
	if !ok {
		state = appendState{nextLine: 1}
	}
	state.nextLine++
	state.needsPrefix = false
	appendStateByFile[filePath] = state
}

func readJSONLAppendState(filePath string) (appendState, error) {
	f, err := os.Open(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return appendState{nextLine: 1}, nil
		}
		return appendState{}, err
	}
	defer f.Close()

	buf := make([]byte, 32*1024)
	byteCount := 0
	newlineCount := 0
	var lastByte byte
	for {
		n, err := f.Read(buf)
		if n > 0 {
			byteCount += n
			for _, b := range buf[:n] {
				if b == '\n' {
					newlineCount++
				}
				lastByte = b
			}
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			return appendState{}, err
		}
	}

	if byteCount == 0 {
		return appendState{nextLine: 1}, nil
	}
	if lastByte == '\n' {
		return appendState{nextLine: newlineCount + 1}, nil
	}
	return appendState{nextLine: newlineCount + 2, needsPrefix: true}, nil
}

func DisplayRelativePath(filePath string, baseDir string) string {
	displayBaseDir := baseDir
	if displayBaseDir == "" {
		cwd, err := os.Getwd()
		if err != nil {
			return filePath
		}
		displayBaseDir = cwd
	}
	absBaseDir, err := filepath.Abs(displayBaseDir)
	if err == nil {
		displayBaseDir = absBaseDir
	}
	rel, err := filepath.Rel(displayBaseDir, filePath)
	rel = filepath.ToSlash(rel)
	if err != nil || rel == "." || rel == ".." || strings.HasPrefix(rel, "../") || filepath.IsAbs(rel) {
		return filePath
	}
	return "./" + rel
}
