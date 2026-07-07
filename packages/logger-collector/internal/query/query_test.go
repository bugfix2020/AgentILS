package query

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func TestReadLogRecordsBackfillsLocationMetadata(t *testing.T) {
	cwd := t.TempDir()
	logDir := filepath.Join(cwd, ".agent-ils", "logger", "logs")
	if err := os.MkdirAll(logDir, 0755); err != nil {
		t.Fatal(err)
	}
	fileName := "old-record.jsonl"
	filePath := filepath.Join(logDir, fileName)
	if err := os.WriteFile(filePath, []byte(`{"ts":"2026-04-30T10:00:00.000Z","level":"info","source":"browser","message":"api.response"}`+"\n"), 0644); err != nil {
		t.Fatal(err)
	}

	records, err := ReadLogRecords(ReadOptions{
		Cwd:    cwd,
		Tail:   1,
		Format: "json",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 1 {
		t.Fatalf("len(records) = %d, want 1", len(records))
	}

	record := records[0]
	expectedRelativeLocation := "./.agent-ils/logger/logs/old-record.jsonl:1"
	expectedLocation := fmt.Sprintf("%s:1", filePath)
	if record.Line == nil || *record.Line != 1 {
		t.Fatalf("line = %#v, want 1", record.Line)
	}
	if record.Location == nil || *record.Location != expectedLocation {
		t.Fatalf("location = %#v, want %q", record.Location, expectedLocation)
	}
	if record.RelativeLocation == nil || *record.RelativeLocation != expectedRelativeLocation {
		t.Fatalf("relativeLocation = %#v, want %q", record.RelativeLocation, expectedRelativeLocation)
	}
}
