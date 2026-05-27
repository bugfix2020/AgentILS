# PRD: Go Collector for @agent-ils/logger

## 简介

将 `@agent-ils/logger` 的核心收集器从 Node.js 重写为 Go 单二进制，支持 `brew install` 和 `winget install`。Node 包的 CLI 改为薄壳，自动下载 Go binary 并 exec 透传参数。

## 目标

- 零依赖安装：`brew install agent-ils-logger` 直接可用
- Node 用户无感：`npx @agent-ils/logger` 自动下载 Go binary，行为与之前一致
- HTTP 协议完全兼容：浏览器 SDK 零改动
- 多平台支持：macOS (amd64/arm64)、Linux (amd64)、Windows (amd64)

## User Stories

### US-001: Go collector HTTP server 实现

**描述：** As a 开发者, I want Go 实现的 HTTP collector, so that 不需要 Node.js 运行时就能收集日志。

**验收标准：**

- [ ] `packages/logger-collector/` 目录包含完整 Go 项目（go.mod, main.go, internal/）
- [ ] 实现 POST /api/logs（单条 + 数组）、GET /api/health、OPTIONS CORS preflight
- [ ] CORS headers: `access-control-allow-origin: *`, `methods: GET,POST,OPTIONS`, `headers: content-type`
- [ ] JSONL 写入 `<logDir>/agent-ils-<source>-YYYY-MM-DD.jsonl`，文件命名与 Node collector 完全一致
- [ ] 默认端口 12138，默认 logDir `<cwd>/.agent-ils/logger/logs`，可通过 flags 覆盖
- [ ] 支持 `--port`、`--host`、`--log-dir`、`--file-prefix` CLI flags
- [ ] `go build` 成功，产物单二进制
- [ ] 现有 browser SDK 的 `createBrowserLogger` 能正常发送日志到 Go collector

### US-002: Go collector read 命令实现

**描述：** As a 开发者, I want Go 实现 read 命令, so that 不依赖 Node.js 就能查询日志。

**验收标准：**

- [ ] 实现 read 子命令：`--tail`、`--from`、`--to`、`--source`、`--level`、`--event`、`--format text|json|jsonl`
- [ ] `--from` / `--to` 支持 ISO timestamp 和相对值（10m、2h、1d）
- [ ] `--tail` 模式按 DESC 排列，`--from/--to` 模式按 ASC 排列
- [ ] 输出格式与 Node 版 `readLogRecords` + `formatLogRecords` 完全一致
- [ ] Typecheck passes

### US-003: Node CLI 薄壳改造

**描述：** As a Node 用户, I want `npx @agent-ils/logger` 自动下载并调用 Go binary, so that 我不需要关心底层实现。

**验收标准：**

- [ ] `packages/logger/src/cli.ts` 改为薄壳：检测平台 → 从 GitHub Release 下载 Go binary → 本地缓存 → exec 透传所有参数
- [ ] 检测本地已有 binary（brew 安装的或之前下载的），不重复下载
- [ ] 缓存目录: `~/.agent-ils/bin/`，文件名包含版本号和平台
- [ ] 下载失败时给出 `brew install` / `winget install` 提示
- [ ] `npx @agent-ils/logger serve` 和 `npx @agent-ils/logger read --tail 50` 均能正常工作
- [ ] SDK 层（browser.ts、index.ts、query.ts）不做任何修改
- [ ] Typecheck passes

### US-004: CI/CD: GoReleaser 多平台构建 + Homebrew tap

**描述：** As a 发布者, I want 自动化构建多平台二进制并发布到包管理器, so that 用户可以一行命令安装。

**验收标准：**

- [ ] `packages/logger-collector/.goreleaser.yml` 配置 darwin-amd64、darwin-arm64、linux-amd64、windows-amd64
- [ ] GitHub Actions workflow: tag 推送触发 GoReleaser 构建
- [ ] 产物上传到 GitHub Release，包含 SHA256 checksums
- [ ] Homebrew tap 配置（`brew tap bugfix2020/agentils && brew install agent-ils-logger`）
- [ ] winget manifest 生成（Windows 包管理器支持）
- [ ] Go CI: merge PR 时跑 `go test` + `go vet` + `golangci-lint`

## 非目标（范围外）

- 不改 SDK 层（browser.ts、index.ts、query.ts）
- 不做 Node collector 的删除（保留作为 fallback）
- 不做实时 tail -f 功能
- 不做远程 forward / 鉴权

## 技术考量

- Go 项目放在 `packages/logger-collector/`，与现有 monorepo 共存
- JSONL 文件格式必须与 Node 版完全一致，query.ts 需能读取 Go collector 写入的文件
- Node CLI 的 binary 下载应使用 `globalThis.fetch` 或 Node 的 `https` 模块
- Homebrew tap 仓库: `bugfix2020/homebrew-agentils`
- GoReleaser 自动更新 Homebrew formula 和 winget manifest

## 成功指标

- `brew install agent-ils-logger` → `agent-ils-logger serve` 启动 collector
- `npx @agent-ils/logger serve` → 自动下载 Go binary → 启动 collector
- browser SDK `createBrowserLogger` 发送日志 → Go collector 收到并写入 JSONL
- `agent-ils-logger read --tail 50` 输出与 Node 版一致
