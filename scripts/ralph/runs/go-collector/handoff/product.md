# US-004 Product Handoff: CI/CD -- GoReleaser Multi-Platform Build + Homebrew Tap

## Goal

Set up CI/CD so that tagged releases automatically build the `agent-ils-logger` Go binary for four platforms (darwin-amd64, darwin-arm64, linux-amd64, windows-amd64), publish artifacts to GitHub Releases with SHA256 checksums, push a Homebrew formula to a tap repo, and generate a winget manifest. Additionally, add a Go CI workflow that runs on every PR/merge to main.

## Current State

### Go project

- Location: `packages/logger-collector/`
- Module: `github.com/bugfix2020/AgentILS/packages/logger-collector` (go 1.22, zero external deps)
- Binary name: `agent-ils-logger`
- Source files: `main.go`, `internal/server/`, `internal/jsonl/`, `internal/payload/`, `internal/query/`
- Currently no `.goreleaser.yml`, no version variable in Go code, no CI for Go

### Existing CI/CD

- `.github/workflows/ci.yml` -- Node monorepo CI (build, typecheck, lint, changeset check). Runs on PR and push to main. **Does NOT run Go tests.**
- `.github/workflows/release.yml` -- Changesets-based npm release. On push to main: if changesets exist, open "Version Packages" PR; if no changesets (PR was just merged), publish to npm with OIDC. **Does NOT build Go binaries.**

### Node thin shell (US-003, done)

- `packages/logger/src/cli.ts` downloads binary from GitHub Release:
    ```
    https://github.com/bugfix2020/AgentILS/releases/download/v<version>/agent-ils-logger-<platformArch>
    ```
    Windows includes `.exe` extension: `agent-ils-logger-windows-amd64.exe`
- Error message references `brew tap bugfix2020/agentils && brew install agent-ils-logger`
- Error message references `winget install bugfix2020.AgentILS.Logger`
- Cache dir: `~/.agent-ils/bin/agent-ils-logger-<platform>-<arch>`

### Version alignment

- `@agent-ils/logger` npm package version is in `packages/logger/package.json` (currently `0.1.0`)
- Go binary has no embedded version; currently `--version` flag is detected but not implemented (it falls through to serve Usage)
- GoReleaser will set version via `-ldflags` at build time
- The npm package and Go binary must share the same version number (both published from the same repo tag)

## Specification for Developer

### 1. GoReleaser Config

Create `packages/logger-collector/.goreleaser.yml`:

```yaml
project_name: agent-ils-logger

before:
    hooks:
        - go mod tidy

builds:
    - id: agent-ils-logger
      main: .
      dir: packages/logger-collector
      binary: agent-ils-logger
      env:
          - CGO_ENABLED=0
      goos:
          - darwin
          - linux
          - windows
      goarch:
          - amd64
          - arm64
      ignore:
          # No linux-arm64 target in acceptance criteria
          - goos: linux
            goarch: arm64
      ldflags:
          - -s -w -X main.version={{.Version}}
      flags:
          - -trimpath

archives:
    - id: default
      name_template: >-
          agent-ils-logger-
          {{- .Os }}-
          {{- if eq .Arch "amd64" }}amd64
          {{- else if eq .Arch "arm64" }}arm64
          {{- end }}
      format: tar.gz
      format_overrides:
          - goos: windows
            format: zip
      files:
          - LICENSE*
          - README*

checksum:
    name_template: checksums.txt
    algorithm: sha256

release:
    # Release is created by the GitHub Actions workflow; GoReleaser just uploads artifacts
    github:
        owner: bugfix2020
        name: AgentILS
    mode: replace
```

**Key details:**

- `dir: packages/logger-collector` -- GoReleaser runs from repo root but builds in the Go project dir
- `ldflags: -s -w` strip debug info and DWARF for smaller binaries
- `-X main.version={{.Version}}` injects the Git tag version into a `var version string` in main.go
- Build targets: darwin/amd64, darwin/arm64, linux/amd64, windows/amd64 (4 binaries)
- linux/arm64 is explicitly ignored (not in acceptance criteria)
- Archive names match the thin shell download pattern: `agent-ils-logger-<os>-<arch>.tar.gz` (or `.zip` on Windows)

**IMPORTANT: Asset naming must match the thin shell URL pattern**

The thin shell expects bare binaries at these URLs:

```
https://github.com/bugfix2020/AgentILS/releases/download/v<version>/agent-ils-logger-darwin-arm64
https://github.com/bugfix2020/AgentILS/releases/download/v<version>/agent-ils-logger-darwin-amd64
https://github.com/bugfix2020/AgentILS/releases/download/v<version>/agent-ils-logger-linux-amd64
https://github.com/bugfix2020/AgentILS/releases/download/v<version>/agent-ils-logger-windows-amd64.exe
```

GoReleaser archives (tar.gz/zip) contain the binary inside. The thin shell currently downloads the bare binary, not the archive. **Two options to resolve this:**

**Option A (RECOMMENDED): Upload raw binaries as extra release assets**

Add a `extra_files` section or a post-hook that uploads the raw binaries alongside the archives. In GoReleaser, use the `extra_files` config:

```yaml
release:
    extra_files:
        - glob: dist/agent-ils-logger_darwin_amd64_v1/agent-ils-logger
          name_template: agent-ils-logger-darwin-amd64
        - glob: dist/agent-ils-logger_darwin_arm64/agent-ils-logger
          name_template: agent-ils-logger-darwin-arm64
        - glob: dist/agent-ils-logger_linux_amd64_v1/agent-ils-logger
          name_template: agent-ils-logger-linux-amd64
        - glob: dist/agent-ils-logger_windows_amd64_v1/agent-ils-logger.exe
          name_template: agent-ils-logger-windows-amd64.exe
```

**Option B: Modify thin shell to download and extract archives**

This is more invasive and changes US-003 (already done). Avoid.

Go with Option A. The bare binary upload ensures the thin shell download URLs work as-is.

### 2. main.go Version Injection

Add a version variable to `main.go` that GoReleaser populates via ldflags:

```go
var version = "dev"
```

Wire it into the `--version` / `-v` flag handling in `detectSubcommand()`. When version flag is detected, print the version and exit:

```go
if arg == "--version" || arg == "-v" {
    fmt.Printf("agent-ils-logger %s\n", version)
    os.Exit(0)
}
```

This is a minimal change to `main.go` (add one `var` and modify the existing `--version` branch).

### 3. GitHub Actions Workflow: Go Release

Create `.github/workflows/go-release.yml`:

```yaml
name: Go Release

on:
    push:
        tags:
            - 'v*'

permissions:
    contents: write

jobs:
    goreleaser:
        runs-on: ubuntu-latest
        timeout-minutes: 15
        steps:
            - uses: actions/checkout@v6
              with:
                  fetch-depth: 0

            - uses: actions/setup-go@v5
              with:
                  go-version: '1.22'

            - name: Run GoReleaser
              uses: goreleaser/goreleaser-action@v6
              with:
                  args: release --clean
                  workdir: packages/logger-collector
              env:
                  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Trigger**: Tag push matching `v*` (e.g., `v0.1.0`). This is separate from the existing changesets release workflow which triggers on push to main.

**Release flow coordination**: The repo has TWO release mechanisms that must coexist:

1. **npm release** (existing): changesets -> "Version Packages" PR -> merge to main -> `pnpm changeset publish` -> npm
2. **Go binary release** (new): after npm publish completes and tag is pushed -> GoReleaser builds and uploads to GitHub Release

The tag for GoReleaser is created by changesets when it publishes. Changesets creates tags like `@agent-ils/logger@0.1.0`. However, GoReleaser expects a single tag that represents the overall release. Recommended approach:

**Option A (RECOMMENDED): Manual tag push for Go binary releases**

- After changesets publishes npm packages, create and push a version tag manually:
    ```bash
    git tag v0.1.0
    git push origin v0.1.0
    ```
- GoReleaser picks up the `v0.1.0` tag and builds the Go binary

**Option B: Automated tag from changesets**

Modify `.github/workflows/release.yml` to push a `v<version>` tag after npm publish. This is more complex and risks triggering both workflows simultaneously.

Go with Option A for simplicity. Document the release process:

```
Release checklist:
1. Merge changeset PR to main (triggers npm publish via release.yml)
2. Tag the commit: git tag v0.1.0 && git push origin v0.1.0
3. GoReleaser builds and uploads Go binaries (go-release.yml)
```

### 4. Go CI Workflow

Create `.github/workflows/go-ci.yml`:

```yaml
name: Go CI

on:
    pull_request:
        paths:
            - 'packages/logger-collector/**'
    push:
        branches: [main]
        paths:
            - 'packages/logger-collector/**'

concurrency:
    group: go-ci-${{ github.workflow }}-${{ github.ref }}
    cancel-in-progress: ${{ github.event_name == 'pull_request' }}

permissions:
    contents: read

jobs:
    go-ci:
        runs-on: ubuntu-latest
        timeout-minutes: 10
        defaults:
            run:
                working-directory: packages/logger-collector
        steps:
            - uses: actions/checkout@v6

            - uses: actions/setup-go@v5
              with:
                  go-version: '1.22'

            - name: Go fmt
              run: test -z "$(gofmt -l .)"

            - name: Go vet
              run: go vet ./...

            - name: Go test
              run: go test ./...

            - name: golangci-lint
              uses: golangci/golangci-lint-action@v6
              with:
                  version: latest
                  working-directory: packages/logger-collector
```

**Trigger**: PRs and pushes to main that touch `packages/logger-collector/**`. This avoids running Go CI when only Node packages change.

**Steps**: gofmt check (files must be formatted), go vet, go test, golangci-lint.

**Note**: The Go project currently has no test files (`_test.go`). The `go test` step will pass with "no test files" which is acceptable for now. golangci-lint will catch real issues.

### 5. Homebrew Tap

**Tap repo**: `bugfix2020/homebrew-agentils`

The Homebrew tap is a SEPARATE repository. GoReleaser can auto-update it via its built-in Homebrew tap support.

Add to `.goreleaser.yml`:

```yaml
brews:
    - name: agent-ils-logger
      tap:
          owner: bugfix2020
          name: homebrew-agentils
          branch: main
      token: '{{ .Env.HOMEBREW_TAP_TOKEN }}'
      commit_author:
          name: bugfix2020[bot]
          email: bot@bugfix2020.dev
      homepage: 'https://github.com/bugfix2020/AgentILS/tree/main/packages/logger-collector'
      description: 'Local JSONL logger for AI-assisted debugging (Go collector binary)'
      license: MIT
      install: |
          bin.install "agent-ils-logger"
      test: |
          system "#{bin}/agent-ils-logger", "--version"
```

**Setup steps (one-time, manual):**

1. Create repo `bugfix2020/homebrew-agentils` on GitHub
2. Create a Personal Access Token (classic) with `repo` scope (or fine-grained with contents write on that repo)
3. Add as GitHub secret `HOMEBREW_TAP_TOKEN` in `bugfix2020/AgentILS`
4. Add `env: HOMEBREW_TAP_TOKEN: ${{ secrets.HOMEBREW_TAP_TOKEN }}` to the go-release workflow

**User install flow:**

```bash
brew tap bugfix2020/agentils
brew install agent-ils-logger
```

**Formula structure (auto-generated by GoReleaser):**

```ruby
class AgentIlsLogger < Formula
  desc "Local JSONL logger for AI-assisted debugging (Go collector binary)"
  homepage "https://github.com/bugfix2020/AgentILS/tree/main/packages/logger-collector"
  url "https://github.com/bugfix2020/AgentILS/archive/refs/tags/v0.1.0.tar.gz"
  sha256 "<auto-calculated>"
  license "MIT"

  depends_on :macos

  def install
    # GoReleaser uploads pre-built binaries; the formula downloads the correct one
  end

  test do
    system "#{bin}/agent-ils-logger", "--version"
  end
end
```

GoReleaser auto-generates this with proper `url` and `sha256` for each platform, so users on Intel Macs get amd64 and Apple Silicon Macs get arm64 automatically.

### 6. Winget Manifest

Winget manifests are YAML files submitted to the `microsoft/winget-pkgs` repository via PR. GoReleaser does NOT have built-in winget support (unlike Homebrew). Options:

**Option A (RECOMMENDED for initial release): Manual winget manifest**

Create and maintain winget manifests manually. Create a directory structure:

```
winget/manifests/b/bugfix2020/AgentILS.Logger/<version>/
  - bugfix2020.AgentILS.Logger.yaml          (main manifest)
  - bugfix2020.AgentILS.Logger.installer.yaml (installer manifest)
  - bugfix2020.AgentILS.Logger.locale.en-US.yaml (locale manifest)
```

**Main manifest** (`bugfix2020.AgentILS.Logger.yaml`):

```yaml
PackageIdentifier: bugfix2020.AgentILS.Logger
PackageVersion: 0.1.0
DefaultLocale: en-US
ManifestType: version
ManifestVersion: 1.6.0
```

**Installer manifest** (`bugfix2020.AgentILS.Logger.installer.yaml`):

```yaml
PackageIdentifier: bugfix2020.AgentILS.Logger
PackageVersion: 0.1.0
Platform:
    - Windows.Desktop
MinimumOSVersion: 10.0.0.0
InstallerType: zip
Installers:
    - Architecture: x64
      InstallerUrl: https://github.com/bugfix2020/AgentILS/releases/download/v0.1.0/agent-ils-logger-windows-amd64.zip
      InstallerSha256: <sha256-of-zip>
      NestedInstallerType: portable
      NestedInstallerFiles:
          - RelativeFilePath: agent-ils-logger.exe
            PortableCommandAlias: agent-ils-logger
ManifestType: installer
ManifestVersion: 1.6.0
```

**Option B: Automate with GitHub Action**

Use `vedantmgoyal2009/winget-releaser` action to auto-submit winget PRs on release. Add to the go-release workflow after GoReleaser completes:

```yaml
- name: Publish to Winget
  uses: vedantmgoyal2009/winget-releaser@v2
  with:
      identifier: bugfix2020.AgentILS.Logger
      version: ${{ github.ref_name }}
      installers-regex: '\.zip$'
      token: ${{ secrets.WINGET_TOKEN }}
```

For the initial release, go with Option A (manual). Add Option B as a follow-up improvement.

### 7. Edge Cases

**Version extraction:**

- GoReleaser uses the Git tag (e.g., `v0.1.0`) as `{{.Version}}` (stripped of `v` prefix in some contexts)
- The ldflags `-X main.version={{.Version}}` sets the version in the Go binary at build time
- The thin shell reads version from `packages/logger/package.json` for the download URL
- Both must stay in sync: when changesets bumps npm version to `0.2.0`, the next Go binary tag must also be `v0.2.0`

**Binary naming conventions:**

- Binary inside archive: `agent-ils-logger` (or `agent-ils-logger.exe` on Windows)
- Archive name: `agent-ils-logger-darwin-arm64.tar.gz`, etc.
- Raw binary asset name (for thin shell): `agent-ils-logger-darwin-arm64`, `agent-ils-logger-windows-amd64.exe`, etc.
- Homebrew formula name: `agent-ils-logger`
- Winget package ID: `bugfix2020.AgentILS.Logger`

**Checksums:**

- GoReleaser generates `checksums.txt` with SHA256 for all archives
- The thin shell does NOT verify checksums (it downloads the raw binary directly) -- this is acceptable for now; checksum verification can be added as a follow-up
- Homebrew formula SHA256 is auto-calculated by GoReleaser from the archive
- Winget manifest SHA256 must be calculated from the Windows zip archive

**Cross-compilation:**

- CGO_ENABLED=0 ensures pure Go builds with no C toolchain needed
- All 4 platforms build on a single ubuntu-latest runner
- No need for macOS or Windows runners for the build itself

**GoReleaser and monorepo:**

- `dir: packages/logger-collector` tells GoReleaser where the Go module lives
- GoReleaser runs from the repo root, so `workdir: packages/logger-collector` in the GitHub Action
- The `.goreleaser.yml` lives in `packages/logger-collector/` to scope it to that project
- Alternative: place `.goreleaser.yml` at repo root with `dir` set -- either works, but collocating with the Go project is cleaner

### 8. Non-Goals

- **Do NOT modify the existing `ci.yml` or `release.yml` workflows.** The Go CI and Go release are separate workflows.
- **Do NOT modify the thin shell** (`packages/logger/src/cli.ts`). It already handles downloads correctly.
- **Do NOT add cross-compilation for linux-arm64.** Only 4 platforms are in scope (darwin-amd64, darwin-arm64, linux-amd64, windows-amd64).
- **Do NOT implement auto-tag from changesets.** Tag push is manual for now.
- **Do NOT set up winget automation for the initial release.** Manual manifest submission is sufficient.
- **Do NOT add `packages/logger-collector` to the changesets ignore list.** It is a Go project, not an npm package -- changesets does not need to know about it.
- **Do NOT create Go test files.** The CI runs `go test` which will pass with "no test files." Adding tests is a separate task.
- **Do NOT set up Docker image builds or Snap packages.** Only archive + bare binary + Homebrew + winget.
- **Do NOT implement self-update in the Go binary.** The thin shell handles version management.

### 9. Files to Create/Modify

| File                                        | Action | Description                                                                       |
| ------------------------------------------- | ------ | --------------------------------------------------------------------------------- |
| `packages/logger-collector/.goreleaser.yml` | Create | GoReleaser config (builds, archives, checksums, Homebrew tap, extra raw binaries) |
| `.github/workflows/go-release.yml`          | Create | Tag push triggers GoReleaser build + upload                                       |
| `.github/workflows/go-ci.yml`               | Create | PR/push to main triggers go fmt + vet + test + golangci-lint                      |
| `packages/logger-collector/main.go`         | Modify | Add `var version = "dev"` and wire `--version` flag to print it                   |

### 10. Release Process (Post-Implementation)

```
1. Developer makes changes, adds changeset: pnpm changeset
2. PR merged to main
3. Changesets action opens "Version Packages" PR
4. Review and merge "Version Packages" PR
5. Changesets action publishes npm packages and creates tags (e.g., @agent-ils/logger@0.2.0)
6. Developer creates and pushes a version tag: git tag v0.2.0 && git push origin v0.2.0
7. GoReleaser action builds 4 binaries, uploads archives + raw binaries + checksums to GitHub Release
8. GoReleaser auto-updates Homebrew formula in bugfix2020/homebrew-agentils
9. (Manual) Submit winget manifest PR to microsoft/winget-pkgs
```

### 11. Acceptance Criteria (from PRD)

1. `packages/logger-collector/.goreleaser.yml` config for darwin-amd64, darwin-arm64, linux-amd64, windows-amd64
2. GitHub Actions workflow: tag push triggers GoReleaser build
3. Artifacts upload to GitHub Release with SHA256 checksums
4. Homebrew tap config (brew tap bugfix2020/agentils && brew install agent-ils-logger)
5. winget manifest generation (Windows package manager support)
6. Go CI: merge PR runs go test + go vet + golangci-lint
