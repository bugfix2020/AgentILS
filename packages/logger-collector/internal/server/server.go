package server

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/bugfix2020/AgentILS/packages/logger-collector/internal/banner"
)

// Server encapsulates the HTTP log collector server.
type Server struct {
	Host           string
	Port           int
	LogDir         string
	FilePrefix     string
	DisplayBaseDir string
	server         *http.Server
}

// New creates a new Server with the given configuration.
func New(host string, port int, logDir string, filePrefix string, displayBaseDir string) *Server {
	return &Server{
		Host:           host,
		Port:           port,
		LogDir:         logDir,
		FilePrefix:     filePrefix,
		DisplayBaseDir: displayBaseDir,
	}
}

// Start starts the HTTP server and blocks until the context is cancelled
// or a signal is received.
func (s *Server) Start(ctx context.Context, params banner.ServerParams, jsonOutput bool, silentOutput bool) error {
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleRequest)

	s.server = &http.Server{
		Addr:    fmt.Sprintf("%s:%d", s.Host, s.Port),
		Handler: mux,
	}

	// Graceful shutdown on context cancellation or signal
	ctx, stop := signal.NotifyContext(ctx, syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	errCh := make(chan error, 1)
	go func() {
		ln, err := net.Listen("tcp", s.server.Addr)
		if err != nil {
			errCh <- fmt.Errorf("failed to listen on %s: %w", s.server.Addr, err)
			return
		}

		// Prevent log directory from being committed
		if mkErr := os.MkdirAll(s.LogDir, 0755); mkErr == nil {
			gitignorePath := filepath.Join(s.LogDir, ".gitignore")
			if _, statErr := os.Stat(gitignorePath); os.IsNotExist(statErr) {
				_ = os.WriteFile(gitignorePath, []byte("*\n"), 0644)
			}
		}

		endpoint := fmt.Sprintf("http://%s", s.server.Addr)

		if !silentOutput {
			params.Endpoint = endpoint
			params.LogDir = s.LogDir
			if jsonOutput {
				banner.PrintJSON(os.Stderr, params)
			} else {
				banner.PrintServer(os.Stderr, params)
			}
		}

		errCh <- s.server.Serve(ln)
	}()

	select {
	case <-ctx.Done():
		shutCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return s.server.Shutdown(shutCtx)
	case err := <-errCh:
		if err == http.ErrServerClosed {
			return nil
		}
		return err
	}
}
