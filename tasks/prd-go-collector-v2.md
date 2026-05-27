# PRD: Go Collector v2 — 调用来源感知 + 品牌启动 Banner

## 简介

Go collector 启动输出是纯文本无品牌标识，`read:` 提示硬编码为 `npx`。v2 需要三件事：

1. 加入 AgentILS 品牌 Banner（与 quality-gate 视觉风格统一）
2. 根据调用来源 + 运行平台动态显示对应命令
3. `--help` 输出格式对齐 quality-gate 的 help.txt 风格

## 目标

- 启动 Banner 复用 quality-gate 的 ASCII art + 渐变色方案
- 信息区使用 ECAM 面板同款 box-drawing 风格（`╔═╗`，dim green 边框，内宽 60）
- 检测调用来源（npx / 直接 binary / go run）+ 运行平台（macOS / Windows / Linux）
- Node 薄壳通过环境变量 `AGENT_ILS_INVOKER=npx` 告知 Go binary
- `--help` 输出与 quality-gate 的 `templates/help.txt` 格式统一

## 品牌 Visual 规范（source of truth: quality-gate）

### Banner ASCII Art

与 `packages/quality-gate/templates/banner.txt` **完全相同**：

```
     ___     _____  ______  __   _  _______  _____  __       _____
    / _ \   / ____||  ____||  \ | ||__   __||_   _|| |     / ____|
   / /_\ \ | |  __ | |__   |   \| |   | |     | |  | |    | (___
  / ___  \ | | |_ ||  __|  | |\   |   | |     | |  | |     \___ \
 / /   \  \| |__| || |____ | | \  |   | |    _| |_ | |____ ____) |
/_/     \__\\_____||______||_|  \_|   |_|   |_____||______|_____/
```

### Banner 渐变色

5 色 xterm-256 渐变，逐字符按水平位置插值（与 quality-gate `colorizeBanner()` 算法一致）：

```
[75]  cyan-blue  →  [105] medium purple  →  [141] lavender  →  [175] rose  →  [204] pink
```

Go 实现：

```go
var bannerColors = [5]string{
    "\x1b[38;5;75m",  // cyan-blue
    "\x1b[38;5;105m", // medium purple
    "\x1b[38;5;141m", // lavender
    "\x1b[38;5;175m", // rose
    "\x1b[38;5;204m", // pink
}

func colorizeBanner(banner string) string {
    // 按 \n 分行，每行逐字符着色：
    // 空格不着色，其他字符按 index/(lineLen-1) 插值选色
    // 每个字符格式：color + char + reset(\x1b[0m)
}
```

### ECAM 信息区样式

与 `packages/quality-gate/src/precommit/panel.tsx` 的 `C` 常量 + box-drawing 一致：

```go
var C = struct {
    Grn, Brt, Amb, Wht, Cyn, Dim, Red, Gry, Rst string
}{
    Grn: "\x1b[32m",      // standard green
    Brt: "\x1b[1;32m",    // bright green (bold)
    Amb: "\x1b[33m",      // amber/yellow
    Wht: "\x1b[1;37m",    // bright white (bold)
    Cyn: "\x1b[36m",      // cyan
    Dim: "\x1b[2;32m",    // dim green — box-drawing 边框专用色
    Red: "\x1b[31m",      // red
    Gry: "\x1b[90m",      // gray
    Rst: "\x1b[0m",       // reset
}

const IW = 60 // inner width，与 ECAM panel 一致

// Box-drawing characters（与 panel.tsx TOP/MID/BOT 一致）：
// ╔ + ═×60 + ╗    (top)
// ╠ + ═×60 + ╣    (separator)
// ╚ + ═×60 + ╝    (bottom)
// ║ content ║      (row)
```

### 状态指示符

与 ECAM panel `stepIndicator()` 一致：

- `●` bright green (`C.Brt`) — 就绪/运行中

### `--help` 格式

与 `packages/quality-gate/templates/help.txt` 格式统一：

```
AgentILS Logger

Usage:
    agent-ils-logger serve [flags]
    agent-ils-logger read [flags]

Commands:
    serve              Start HTTP log collector (default)
    read               Query and read JSONL log files

Options:
    --host <addr>      HTTP bind host (default: 127.0.0.1)
    --port <num>       HTTP bind port (default: 12138)
    --log-dir <path>   JSONL output directory
    ...

Examples:
    agent-ils-logger serve
    agent-ils-logger serve --port 8080
    agent-ils-logger read --tail 50
    npx @agent-ils/logger serve
```

## 调用来源 × 平台矩阵

| 来源            | 平台    | read 提示                              | install 提示                                                    |
| --------------- | ------- | -------------------------------------- | --------------------------------------------------------------- |
| npx (Node 薄壳) | 任意    | `npx @agent-ils/logger read --tail 50` | 不显示                                                          |
| 直接 binary     | macOS   | `agent-ils-logger read --tail 50`      | `brew tap bugfix2020/agentils && brew install agent-ils-logger` |
| 直接 binary     | Windows | `agent-ils-logger read --tail 50`      | `winget install bugfix2020.AgentILS.Logger`                     |
| 直接 binary     | Linux   | `agent-ils-logger read --tail 50`      | `https://github.com/bugfix2020/AgentILS/releases`               |
| go run          | 任意    | `go run . read --tail 50`              | 不显示                                                          |

---

## User Stories

### US-001: 品牌 Banner + ECAM 信息区 + 平台感知输出

**描述：** As a 用户, I want 启动时看到与 quality-gate 统一的品牌界面，且命令提示匹配我的调用方式和平台。

**验收标准：**

- [ ] Go binary 启动输出 AgentILS ASCII banner，与 `packages/quality-gate/templates/banner.txt` 完全一致
- [ ] Banner 使用 5 色渐变（`\x1b[38;5;75/105/141/175/204m`），逐字符按水平位置插值，空格不着色
- [ ] Banner 后紧跟 ECAM 风格信息区（`╔═╗` box-drawing，dim green 边框，内宽 60）
- [ ] 信息区包含：header 行（`AGENTILS  LOGGER SERVICE`）、版本号、分隔线、endpoint/logDir/read 行
- [ ] 版本号从 ldflags 注入的 `version` 变量读取，banner 渐变色下方显示 `v0.1.0` 或 `dev`
- [ ] 状态指示符使用 `●`（bright green），与 ECAM panel 的 `stepIndicator(passed)` 一致

**输出示例（直接 binary + macOS，完整版）：**

```
     ___     _____  ______  __   _  _______  _____  __       _____
    / _ \   / ____||  ____||  \ | ||__   __||_   _|| |     / ____|
   / /_\ \ | |  __ | |__   |   \| |   | |     | |  | |    | (___
  / ___  \ | | |_ ||  __|  | |\   |   | |     | |  | |     \___ \
 / /   \  \| |__| || |____ | | \  |   | |    _| |_ | |____ ____) |
/_/     \__\\_____||______||_|  \_|   |_|   |_____||______|_____/

╔══════════════════════════════════════════════════════════╗
║  AGENTILS  LOGGER SERVICE · v0.1.0                      ║
╠══════════════════════════════════════════════════════════╣
║  ● server ready                                         ║
║                                                         ║
║  endpoint   http://127.0.0.1:12138                      ║
║  logDir     /path/to/.agent-ils/logger/logs             ║
║                                                         ║
║  read       agent-ils-logger read --tail 50             ║
║  install    brew tap bugfix2020/agentils &&             ║
║             brew install agent-ils-logger               ║
╚══════════════════════════════════════════════════════════╝
```

**输出示例（直接 binary + Windows）：**

```
[渐变色 banner]

╔══════════════════════════════════════════════════════════╗
║  AGENTILS  LOGGER SERVICE · v0.1.0                      ║
╠══════════════════════════════════════════════════════════╣
║  ● server ready                                         ║
║                                                         ║
║  endpoint   http://127.0.0.1:12138                      ║
║  logDir     C:\path\to\.agent-ils\logger\logs           ║
║                                                         ║
║  read       agent-ils-logger read --tail 50             ║
║  install    winget install bugfix2020.AgentILS.Logger   ║
╚══════════════════════════════════════════════════════════╝
```

**输出示例（npx 模式）：**

```
[渐变色 banner]

╔══════════════════════════════════════════════════════════╗
║  AGENTILS  LOGGER SERVICE · v0.1.0                      ║
╠══════════════════════════════════════════════════════════╣
║  ● server ready                                         ║
║                                                         ║
║  endpoint   http://127.0.0.1:12138                      ║
║  logDir     /path/to/.agent-ils/logger/logs             ║
║                                                         ║
║  read       npx @agent-ils/logger read --tail 50        ║
╚══════════════════════════════════════════════════════════╝
```

（npx 模式无 `install` 行）

**输出示例（go run 模式）：**

```
[渐变色 banner]

╔══════════════════════════════════════════════════════════╗
║  AGENTILS  LOGGER SERVICE · dev                         ║
╠══════════════════════════════════════════════════════════╣
║  ● server ready                                         ║
║                                                         ║
║  endpoint   http://127.0.0.1:12138                      ║
║  logDir     /path/to/.agent-ils/logger/logs             ║
║                                                         ║
║  read       go run . read --tail 50                     ║
╚══════════════════════════════════════════════════════════╝
```

（go run 模式无 `install` 行，版本显示 `dev`）

- [ ] 检测逻辑（按优先级）：
    1. 环境变量 `AGENT_ILS_INVOKER=npx` → npx 模式
    2. `os.Args[0]` 含 `go-build` → go run 模式
    3. 默认 → 直接 binary 模式
- [ ] 直接 binary 模式下按 `runtime.GOOS` 区分平台安装提示
- [ ] 信息区内容自动截断：超过 IW-2 字符的值截断并加 `…`
- [ ] JSON 模式（`--json`）的 `read` 和 `installHint` 字段适配，不输出 banner
- [ ] `--silent` 模式不输出任何内容（行为不变）
- [ ] 输出到 **stderr**（不污染 stdout pipe）
- [ ] `go build` 成功，`go vet` 通过

### US-002: `--help` 输出格式对齐 quality-gate

**描述：** As a 用户, I want `--help` 输出与 quality-gate 风格统一（Banner + 格式化文本），且 Usage 行使用检测到的调用前缀。

**验收标准：**

- [ ] `--help` / `-h` 输出格式：Banner（渐变色） + 空行 + 纯文本帮助（与 quality-gate 的 `renderHelp()` 模式一致）
- [ ] 帮助文本格式与 quality-gate `templates/help.txt` 统一：

```
AgentILS Logger

Usage:
    <invokePrefix> serve [flags]
    <invokePrefix> read [flags]

Commands:
    serve              Start HTTP log collector (default)
    read               Query and read JSONL log files

Serve Options:
    --host <addr>      HTTP bind host (default: 127.0.0.1)
    --port <num>       HTTP bind port (default: 12138)
    --log-dir <path>   JSONL output directory
    --file-prefix <s>  Default file prefix for JSONL files (default: agent-ils)
    --json             Output startup info as JSON
    --silent           Suppress startup output

Read Options:
    --tail <n>         Number of recent records (default: 50)
    --from <time>      Start time filter (ISO, epoch ms, or 10m/2h/1d)
    --to <time>        End time filter
    --source <s>       Filter by source field
    --level <s>        Filter by level field (case-insensitive)
    --event <s>        Filter by event field
    --format <fmt>     Output format: text, json, jsonl (default: text)

Examples:
    agent-ils-logger serve
    agent-ils-logger serve --port 8080
    agent-ils-logger read --tail 50
    agent-ils-logger read --from 10m --format json
    npx @agent-ils/logger serve
```

- [ ] `<invokePrefix>` 根据调用来源替换：npx → `npx @agent-ils/logger`，gorun → `go run .`，binary → `agent-ils-logger`
- [ ] 帮助文本用 ANSI 颜色：标题 bright white，标签 green，描述 light gray
- [ ] 不再使用 Go `flag` 包的默认 `PrintDefaults()` 输出
- [ ] `go build` 成功，`go vet` 通过

### US-003: Node 薄壳透传调用来源标记

**描述：** As a Node 薄壳, I want 透传 `AGENT_ILS_INVOKER=npx` 给 Go binary, so that Go binary 知道自己是被 npx 调用的。

**验收标准：**

- [ ] `packages/logger/src/cli.ts` 的 spawn 调用中注入 `env: { ...process.env, AGENT_ILS_INVOKER: 'npx' }`
- [ ] SDK 层（browser.ts、index.ts、query.ts）不做任何修改
- [ ] `pnpm --filter @agent-ils/logger build` 通过

---

## 非目标（范围外）

- 不改变 Go binary 的功能逻辑（HTTP、JSONL、query）
- 不新增子命令或 CLI flag
- 不引入 Ink / React / 任何 Node.js 依赖
- 不使用第三方 Go TUI 库（只用 stdlib `fmt.Printf` + ANSI 转义）
- 不做终端宽度自适应（固定内宽 60）
- 不做 Windows cmd.exe 特殊适配（Win10+ 原生支持 ANSI）
- 不在 JSON 模式输出 Banner

## 技术考量

### 文件结构

```
packages/logger-collector/
  internal/
    banner/
      banner.go      — ASCII art 常量 + 渐变色着色 + ECAM 信息区渲染
      colors.go      — C 颜色常量 + bannerColors 渐变色
    server/
      server.go      — Start() 调用 banner.Print() 替代 printStartupHuman/JSON
```

### 调用来源检测

```go
func detectInvoker() string {
    if os.Getenv("AGENT_ILS_INVOKER") == "npx" {
        return "npx"
    }
    if strings.Contains(os.Args[0], "go-build") {
        return "gorun"
    }
    return "binary"
}
```

### 平台感知安装提示

```go
func installHint() string {
    switch runtime.GOOS {
    case "darwin":
        return "brew tap bugfix2020/agentils && brew install agent-ils-logger"
    case "windows":
        return "winget install bugfix2020.AgentILS.Logger"
    default:
        return "https://github.com/bugfix2020/AgentILS/releases"
    }
}
```

### 调用前缀映射

```go
func invokePrefix(mode string) string {
    switch mode {
    case "npx":
        return "npx @agent-ils/logger"
    case "gorun":
        return "go run ."
    default:
        return "agent-ils-logger"
    }
}
```

### Banner 渐变算法（移植 quality-gate colorizeBanner）

```go
func colorizeBanner(banner string) string {
    lines := strings.Split(banner, "\n")
    var sb strings.Builder
    for i, line := range lines {
        if i > 0 { sb.WriteByte('\n') }
        runes := []rune(line)
        lineLen := len(runes)
        for j, ch := range runes {
            if ch == ' ' {
                sb.WriteRune(ch)
                continue
            }
            // 与 quality-gate 算法一致：按水平位置插值
            idx := int(float64(j) / float64(max(lineLen-1, 1)) * float64(len(bannerColors)-1))
            sb.WriteString(bannerColors[idx])
            sb.WriteRune(ch)
            sb.WriteString("\x1b[0m")
        }
    }
    return sb.String()
}
```

### Node 薄壳改动（1 行）

```typescript
const child = spawn(binaryPath, process.argv.slice(2), {
    stdio: 'inherit',
    env: { ...process.env, AGENT_ILS_INVOKER: 'npx' },
})
```

### 参数传递

`main.go` 检测调用来源 → 计算 `invokePrefix` + `installHint` → 传给 `server.Start()` → `banner.PrintServer()`。server/banner 包不做检测。

### --help 输出

`main.go` 的 `detectSubcommand` 在检测到 `--help` 时调用 `banner.PrintHelp(invokePrefix)` 替代 `flag` 默认 usage。

## 成功指标

- `go run .` → Banner + ECAM 面板显示 `read: go run . read --tail 50`，版本 `dev`，无 install 行
- `./agent-ils-logger`（macOS）→ `read: agent-ils-logger read --tail 50`，`install: brew ...`
- `./agent-ils-logger.exe`（Windows）→ `read: agent-ils-logger read --tail 50`，`install: winget ...`
- `npx @agent-ils/logger serve` → `read: npx @agent-ils/logger read --tail 50`，无 install 行
- `--help` 输出 Banner + 格式化文本，Usage 行跟随调用方式
- Banner 渐变色与 quality-gate 视觉一致
- ECAM box-drawing 与 quality-gate precommit panel 边框样式一致
