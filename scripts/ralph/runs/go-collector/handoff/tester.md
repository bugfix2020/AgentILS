# Tester Handoff

## Story

- id: US-004
- title: CI/CD: GoReleaser 多平台构建 + Homebrew tap

## Verification Summary

All 6 acceptance criteria verified and passed. Every file was read and inspected against the product handoff specification.

### AC1: GoReleaser config with 4 build targets -- PASS

- `.goreleaser.yml` configures goos: [darwin, linux, windows], goarch: [amd64, arm64]
- linux/arm64 is in the ignore list, yielding exactly 4 targets: darwin-amd64, darwin-arm64, linux-amd64, windows-amd64
- ldflags: `-s -w -X main.version={{.Version}}` -- version injection confirmed
- Archives: tar.gz for unix, zip for windows (format_overrides confirmed)
- Checksum: algorithm sha256 in checksums.txt
- extra_files: 4 raw binaries uploaded (darwin-amd64, darwin-arm64, linux-amd64, windows-amd64.exe) for thin shell compatibility

### AC2: GitHub Actions workflow for tag-triggered GoReleaser -- PASS

- `.github/workflows/go-release.yml` triggers on `push: tags: ['v*']`
- Uses actions/checkout@v4 with fetch-depth: 0
- Uses actions/setup-go@v5 with go-version: '1.22'
- Uses goreleaser/goreleaser-action@v6 with workdir: packages/logger-collector
- Env vars: GITHUB_TOKEN (auto), HOMEBREW_TAP_TOKEN (secret)

### AC3: Artifacts upload to GitHub Release with SHA256 checksums -- PASS

- checksum section: name_template checksums.txt, algorithm sha256
- release section: owner bugfix2020, name AgentILS, mode replace
- extra_files upload raw binaries matching thin shell download URL pattern

### AC4: Homebrew tap config -- PASS

- brews section with tap owner: bugfix2020, name: homebrew-agentils, branch: main
- token: `{{ .Env.HOMEBREW_TAP_TOKEN }}`
- install: `bin.install "agent-ils-logger"`
- test: `system "#{bin}/agent-ils-logger", "--version"`
- commit_author, homepage, description, license all present

### AC5: winget manifest -- PASS

- 3 files in `packages/logger-collector/winget/`: version, installer, locale (en-US)
- PackageIdentifier: bugfix2020.AgentILS.Logger in all 3 files
- Installer URL pattern: `https://github.com/bugfix2020/AgentILS/releases/download/v<VERSION>/agent-ils-logger-windows-amd64.zip`
- ManifestVersion: 1.6.0 in all files
- Placeholders for VERSION and SHA256 (manual fill at release time)

### AC6: Go CI workflow -- PASS

- `.github/workflows/go-ci.yml` triggers on PR + push to main with path filter `packages/logger-collector/**`
- Steps: gofmt check (`test -z "$(gofmt -l .)"`), go vet, go test, golangci-lint
- Working directory default: packages/logger-collector
- Concurrency group with cancel-in-progress for PRs
- golangci-lint-action@v6 with working-directory set correctly

### Additional verifications

- `go build ./...` -- PASS (no errors)
- `go vet ./...` -- PASS (no errors)
- `--version` flag prints `agent-ils-logger dev` (default)
- `-v` short flag also works
- ldflags injection: `go build -ldflags "-X main.version=0.1.0"` prints `agent-ils-logger 0.1.0`
- `serve` and `read` subcommands still work correctly after version changes
- `var version = "dev"` present in main.go line 16

## Commands Run

1. `go build ./...` from packages/logger-collector -- PASS
2. `go vet ./...` from packages/logger-collector -- PASS
3. `go build -o agent-ils-logger . && ./agent-ils-logger --version` -- prints "agent-ils-logger dev"
4. `go build -ldflags "-X main.version=0.1.0" -o agent-ils-logger . && ./agent-ils-logger --version` -- prints "agent-ils-logger 0.1.0"
5. `./agent-ils-logger -v` -- prints "agent-ils-logger 0.1.0"
6. `./agent-ils-logger read --tail 5 --log-dir /tmp/nonexistent` -- "No log records found."
7. `./agent-ils-logger serve --help` -- usage printed correctly
8. Read and verified all source files: .goreleaser.yml, go-release.yml, go-ci.yml, main.go, 3 winget manifests

## Result

PASS

## Failure Reason

N/A

## Required Fixes

None. All 6 acceptance criteria pass.
