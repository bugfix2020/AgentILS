# Developer Handoff

## Story

- id: US-004
- title: CI/CD: GoReleaser 多平台构建 + Homebrew tap

## Files Changed

- `packages/logger-collector/.goreleaser.yml` — Created: GoReleaser config with 4 build targets, archives, checksums, Homebrew tap, raw binary uploads
- `packages/logger-collector/main.go` — Modified: Added `var version = "dev"` and `--version`/`-v` flag handling
- `.github/workflows/go-release.yml` — Created: Tag push triggers GoReleaser build + upload + Homebrew tap update
- `.github/workflows/go-ci.yml` — Created: PR/push to main touching logger-collector triggers fmt/vet/test/lint
- `packages/logger-collector/winget/bugfix2020.AgentILS.Logger.yaml` — Created: Winget version manifest template
- `packages/logger-collector/winget/bugfix2020.AgentILS.Logger.installer.yaml` — Created: Winget installer manifest template
- `packages/logger-collector/winget/bugfix2020.AgentILS.Logger.locale.en-US.yaml` — Created: Winget locale manifest template

## Implementation Summary

### GoReleaser Config (.goreleaser.yml)

- 4 build targets: darwin-amd64, darwin-arm64, linux-amd64, windows-amd64
- linux-arm64 explicitly ignored (not in acceptance criteria)
- ldflags: `-s -w -X main.version={{.Version}}` for version injection + binary size reduction
- `-trimpath` flag for reproducible builds
- Archives: tar.gz (unix) / zip (windows), named `agent-ils-logger-<os>-<arch>`
- Checksums: SHA256 in `checksums.txt`
- Extra files: Raw binaries uploaded to release matching thin shell download URLs (agent-ils-logger-darwin-arm64, etc.)
- Homebrew tap: brews section targeting bugfix2020/homebrew-agentils with HOMEBREW_TAP_TOKEN
- Release target: bugfix2020/AgentILS in replace mode

### Version Injection (main.go)

- Added `var version = "dev"` at package level (overridden by ldflags at build time)
- `--version` / `-v` flags now print `agent-ils-logger <version>` and exit immediately
- `--help` / `-h` still routes to serve for flag package handling
- serve and read subcommands unchanged

### Go Release Workflow (go-release.yml)

- Trigger: push of tags matching `v*`
- Steps: checkout (fetch-depth 0), setup Go 1.22, run GoReleaser
- Environment: GITHUB_TOKEN (auto-provided), HOMEBREW_TAP_TOKEN (secret)
- Workdir: packages/logger-collector

### Go CI Workflow (go-ci.yml)

- Trigger: PR + push to main, only when `packages/logger-collector/**` files change
- Steps: gofmt check, go vet, go test, golangci-lint
- Working directory default: packages/logger-collector
- Concurrency: cancel in-progress on PR updates

### Winget Manifests

- Created template manifests in `packages/logger-collector/winget/`
- Three files: version, installer, locale (en-US)
- Placeholders for VERSION and SHA256 -- filled in manually at release time
- Manual submission to microsoft/winget-pkgs via PR

## Commands Run

- `go build ./...` — PASS (from packages/logger-collector)
- `go vet ./...` — PASS
- `./agent-ils-logger --version` — prints "agent-ils-logger dev"
- `./agent-ils-logger -v` — prints "agent-ils-logger dev"
- `go build -ldflags "-X main.version=0.1.0" -o agent-ils-logger . && ./agent-ils-logger --version` — prints "agent-ils-logger 0.1.0"
- `./agent-ils-logger read --tail 5 --log-dir /tmp/nonexistent` — "No log records found." (read subcommand works)
- `./agent-ils-logger serve --help` — usage printed correctly
- YAML syntax validation (Ruby YAML.load_file) — all 3 YAML files PASS

## Known Risks

- **HOMEBREW_TAP_TOKEN must be set** as a GitHub secret before the first tag push, or the GoReleaser run will fail on the Homebrew tap push step. The token needs `repo` scope (classic PAT) or contents:write on bugfix2020/homebrew-agentils (fine-grained PAT).
- **The tap repo bugfix2020/homebrew-agentils must exist** before the first release. GoReleaser cannot create it.
- **Tag push coordination**: The Go binary release requires a manual `v*` tag push after changesets npm publish. If the tag version doesn't match the npm package version, the thin shell will download a version-mismatched binary.
- **No Go test files exist**: `go test ./...` passes with "no test files" warning. This is acceptable per product handoff but means the CI test step is a no-op.
- **Winget is manual**: Winget manifests are templates that must be manually filled in and submitted to microsoft/winget-pkgs after each release.

## Notes for Tester

### Acceptance Criterion 1: .goreleaser.yml with 4 platforms

- Check `packages/logger-collector/.goreleaser.yml` has goos: [darwin, linux, windows], goarch: [amd64, arm64], with linux/arm64 in ignore list
- This yields exactly 4 targets: darwin-amd64, darwin-arm64, linux-amd64, windows-amd64

### Acceptance Criterion 2: GitHub Actions workflow for tag-triggered GoReleaser

- Check `.github/workflows/go-release.yml` triggers on `push: tags: ['v*']`
- Verify it sets up Go 1.22 and runs goreleaser/goreleaser-action@v6

### Acceptance Criterion 3: Artifacts + SHA256 checksums

- Check .goreleaser.yml has `checksum: algorithm: sha256`
- Check `release.extra_files` uploads raw binaries matching thin shell URL pattern
- Check archives section has format_overrides for windows (zip)

### Acceptance Criterion 4: Homebrew tap

- Check .goreleaser.yml has `brews` section with tap owner: bugfix2020, name: homebrew-agentils
- Check token is set from HOMEBREW_TAP_TOKEN env var
- Check formula has install and test blocks

### Acceptance Criterion 5: Winget manifest

- Check `packages/logger-collector/winget/` directory has 3 manifest files
- Verify templates have correct PackageIdentifier: bugfix2020.AgentILS.Logger
- Verify installer URL pattern matches release URL format

### Acceptance Criterion 6: Go CI

- Check `.github/workflows/go-ci.yml` triggers on PR + push to main with paths filter
- Verify steps: gofmt, go vet, go test, golangci-lint
- Verify working-directory is set to packages/logger-collector
