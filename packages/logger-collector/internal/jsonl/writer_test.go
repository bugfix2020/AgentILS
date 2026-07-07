package jsonl

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/bugfix2020/AgentILS/packages/logger-collector/internal/payload"
)

func TestWriteRecordReturnsLocationMetadata(t *testing.T) {
	logDir := t.TempDir()
	source := "browser"
	level := "info"
	event := "api.response"
	message := "api.response"
	fileName := "llm-location.jsonl"
	recordPayload := &payload.HttpLogPayload{
		Source:   &source,
		Level:    &level,
		Event:    &event,
		Message:  &message,
		FileName: &fileName,
		Fields: map[string]interface{}{
			"url":    "/api/users",
			"status": float64(200),
		},
	}

	first, err := WriteRecord(logDir, "agent-ils", recordPayload, 1, 123)
	if err != nil {
		t.Fatal(err)
	}
	second, err := WriteRecord(logDir, "agent-ils", recordPayload, 2, 123)
	if err != nil {
		t.Fatal(err)
	}

	absLogDir, err := filepath.Abs(logDir)
	if err != nil {
		t.Fatal(err)
	}
	expectedPath := filepath.Join(absLogDir, fileName)
	if first.Line != 1 {
		t.Fatalf("first line = %d, want 1", first.Line)
	}
	if second.Line != 2 {
		t.Fatalf("second line = %d, want 2", second.Line)
	}
	if second.FilePath != expectedPath {
		t.Fatalf("filePath = %q, want %q", second.FilePath, expectedPath)
	}
	if second.Location != fmt.Sprintf("%s:2", expectedPath) {
		t.Fatalf("location = %q", second.Location)
	}
	if !strings.HasSuffix(second.RelativeLocation, ":2") {
		t.Fatalf("relativeLocation = %q, want line suffix", second.RelativeLocation)
	}
}

func TestWriteRecordWithBaseDirReturnsProjectRelativeLocation(t *testing.T) {
	projectRoot := t.TempDir()
	logDir := filepath.Join(projectRoot, ".agent-ils", "logger", "logs")
	source := "browser"
	level := "info"
	event := "api.response"
	message := "api.response"
	fileName := "project-relative.jsonl"
	recordPayload := &payload.HttpLogPayload{
		Source:   &source,
		Level:    &level,
		Event:    &event,
		Message:  &message,
		FileName: &fileName,
	}

	record, err := WriteRecordWithBaseDir(logDir, projectRoot, "agent-ils", recordPayload, 1, 123)
	if err != nil {
		t.Fatal(err)
	}

	expectedRelativePath := "./.agent-ils/logger/logs/project-relative.jsonl"
	if record.RelativePath != expectedRelativePath {
		t.Fatalf("relativePath = %q, want %q", record.RelativePath, expectedRelativePath)
	}
	if record.RelativeLocation != expectedRelativePath+":1" {
		t.Fatalf("relativeLocation = %q, want %q", record.RelativeLocation, expectedRelativePath+":1")
	}
}

func TestWriteRecordAppendsAfterUnterminatedJSONLLine(t *testing.T) {
	logDir := t.TempDir()
	fileName := "append-state.jsonl"
	filePath := filepath.Join(logDir, fileName)
	if err := os.WriteFile(filePath, []byte(`{"ts":"2026-04-30T10:00:00.000Z","level":"info"}`), 0644); err != nil {
		t.Fatal(err)
	}

	source := "browser"
	level := "warn"
	event := "api.slow"
	message := "api.slow"
	recordPayload := &payload.HttpLogPayload{
		Source:   &source,
		Level:    &level,
		Event:    &event,
		Message:  &message,
		FileName: &fileName,
		Fields: map[string]interface{}{
			"costMs": float64(3500),
		},
	}

	first, err := WriteRecord(logDir, "agent-ils", recordPayload, 1, 123)
	if err != nil {
		t.Fatal(err)
	}
	second, err := WriteRecord(logDir, "agent-ils", recordPayload, 2, 123)
	if err != nil {
		t.Fatal(err)
	}

	if first.Line != 2 {
		t.Fatalf("first line = %d, want 2", first.Line)
	}
	if second.Line != 3 {
		t.Fatalf("second line = %d, want 3", second.Line)
	}
	if !strings.HasSuffix(second.RelativeLocation, ":3") {
		t.Fatalf("relativeLocation = %q, want line suffix", second.RelativeLocation)
	}
}
