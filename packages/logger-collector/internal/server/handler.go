package server

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sync/atomic"

	"github.com/bugfix2020/AgentILS/packages/logger-collector/internal/jsonl"
	"github.com/bugfix2020/AgentILS/packages/logger-collector/internal/payload"
)

const maxBodyBytes = 1024 * 1024 // 1 MiB

var sequenceCounter int64

func (s *Server) handleRequest(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w)

	// Handle CORS preflight
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// GET /api/health
	if r.Method == http.MethodGet && r.URL.Path == "/api/health" {
		absLogDir, _ := absPath(s.LogDir)
		sendJSON(w, http.StatusOK, map[string]interface{}{
			"ok":     true,
			"name":   "agentils-logger",
			"logDir": absLogDir,
		})
		return
	}

	// POST /api/logs
	if r.Method == http.MethodPost && r.URL.Path == "/api/logs" {
		s.handlePostLogs(w, r)
		return
	}

	// 404 for everything else
	sendJSON(w, http.StatusNotFound, map[string]interface{}{
		"ok":    false,
		"error": "not-found",
	})
}

func (s *Server) handlePostLogs(w http.ResponseWriter, r *http.Request) {
	// Read body with size limit
	body, err := readBody(r)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]interface{}{
			"ok":    false,
			"error": err.Error(),
		})
		return
	}

	// Ensure log directory exists
	if err := os.MkdirAll(s.LogDir, 0755); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]interface{}{
			"ok":    false,
			"error": err.Error(),
		})
		return
	}

	pid := os.Getpid()

	// Try to parse as array first, then as single object
	// We need to determine if it's an array or a single object
	var raw interface{}
	if err := json.Unmarshal(body, &raw); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]interface{}{
			"ok":    false,
			"error": err.Error(),
		})
		return
	}

	switch v := raw.(type) {
	case []interface{}:
		records := make([]*payload.JsonlLogRecord, 0, len(v))
		for _, item := range v {
			itemBytes, _ := json.Marshal(item)
			p := &payload.HttpLogPayload{}
			if err := json.Unmarshal(itemBytes, p); err != nil {
				sendJSON(w, http.StatusBadRequest, map[string]interface{}{
					"ok":    false,
					"error": err.Error(),
				})
				return
			}
			seq := atomic.AddInt64(&sequenceCounter, 1)
			rec, err := jsonl.WriteRecord(s.LogDir, s.FilePrefix, p, seq, pid)
			if err != nil {
				sendJSON(w, http.StatusInternalServerError, map[string]interface{}{
					"ok":    false,
					"error": err.Error(),
				})
				return
			}
			records = append(records, rec)
		}
		sendJSON(w, http.StatusOK, map[string]interface{}{
			"ok":      true,
			"records": records,
		})
	case map[string]interface{}:
		p := &payload.HttpLogPayload{}
		if err := json.Unmarshal(body, p); err != nil {
			sendJSON(w, http.StatusBadRequest, map[string]interface{}{
				"ok":    false,
				"error": err.Error(),
			})
			return
		}
		seq := atomic.AddInt64(&sequenceCounter, 1)
		rec, err := jsonl.WriteRecord(s.LogDir, s.FilePrefix, p, seq, pid)
		if err != nil {
			sendJSON(w, http.StatusInternalServerError, map[string]interface{}{
				"ok":    false,
				"error": err.Error(),
			})
			return
		}
		sendJSON(w, http.StatusOK, map[string]interface{}{
			"ok":    true,
			"record": rec,
		})
	default:
		sendJSON(w, http.StatusBadRequest, map[string]interface{}{
			"ok":    false,
			"error": "invalid payload type",
		})
	}
}

func readBody(r *http.Request) ([]byte, error) {
	reader := io.LimitReader(r.Body, maxBodyBytes+1)
	body, err := io.ReadAll(reader)
	if err != nil {
		return nil, err
	}
	if len(body) > maxBodyBytes {
		return nil, fmt.Errorf("request-body-too-large")
	}
	// Empty body treated as {}
	if len(body) == 0 {
		return []byte("{}"), nil
	}
	return body, nil
}

func setCORSHeaders(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "content-type")
}

func sendJSON(w http.ResponseWriter, status int, body interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(body)
}

func absPath(p string) (string, error) {
	return filepath.Abs(p)
}
