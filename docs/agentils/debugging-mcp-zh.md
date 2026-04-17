# AgentILS MCP Server 调试指引

本文档覆盖 AgentILS 核心 MCP Server 的构建、运行和调试流程。

---

## 1. 前置准备

### 1.1 环境要求

| 依赖 | 最低版本 |
|------|---------|
| Node.js | 20+ |
| npm | 9+ |
| TypeScript | 5.8+ |

### 1.2 安装依赖

```bash
# 在项目根目录执行
npm install
```

---

## 2. 项目构建

AgentILS 使用 `tsup` 作为打包工具，输出 ESM 格式产物到 `dist/` 目录。

### 2.1 完整构建

```bash
npm run build
```

构建完成后，`dist/index.js` 是 MCP Server 的入口文件。

### 2.2 监听模式（开发推荐）

```bash
npm run dev
```

此命令会使用 `tsup --watch` 监听 `src/` 目录的变更，自动增量重新构建。

### 2.3 类型检查（不产出文件）

```bash
npm run typecheck
```

---

## 3. 运行 MCP Server

AgentILS MCP Server 支持两种传输方式：**stdio** 和 **Streamable HTTP**。

### 3.1 stdio 模式

stdio 模式是 VS Code MCP 客户端使用的默认传输。Server 通过 stdin/stdout 与客户端通信。

```bash
# 直接启动（使用构建产物）
npm start
# 等同于
node dist/index.js
```

也可以使用 `tsx` 直接运行 TypeScript 源码（无需先构建）：

```bash
npx tsx src/index.ts
```

> **注意**：stdio 模式下，所有日志会输出到 **stderr**，以避免干扰 stdout 上的 MCP length-prefixed framing 协议。

### 3.2 Streamable HTTP 模式

HTTP 模式适合独立调试、集成测试和工具调用验证。

```bash
# 使用构建产物
npm run start:http
# 等同于
node dist/index.js --http

# 使用 tsx 直接运行源码（开发推荐）
npm run dev:http
# 等同于
tsx src/index.ts --http
```

默认监听 `127.0.0.1:8788`，可通过环境变量覆盖：

```bash
AGENT_GATE_HTTP_HOST=0.0.0.0 AGENT_GATE_HTTP_PORT=9000 npm run start:http
```

### 3.3 健康检查

HTTP 模式启动后，可通过 `/health` 端点确认 Server 状态：

```bash
curl http://127.0.0.1:8788/health
# 返回：{"ok":true,"name":"AgentILS","transport":"streamable-http","endpoint":"/mcp"}
```

### 3.4 冒烟测试

快速验证构建产物是否可以正常加载：

```bash
npm run smoke
# 返回：{"ok":true,"name":"AgentILS"}
```

---

## 4. 调试 MCP Server

### 4.1 使用 MCP Inspector 调试（推荐）

[MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) 是 MCP 官方提供的交互式调试 UI，可以可视化调用 tools、prompts 和 resources。

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

Inspector 会在浏览器中打开一个面板，列出 Server 注册的全部工具。你可以：
- 查看所有 tools、prompts、resources 的 schema
- 手动输入参数并调用任意 tool
- 查看返回结果和错误信息

使用 tsx 直接调试源码：

```bash
npx @modelcontextprotocol/inspector npx tsx src/index.ts
```

### 4.2 使用 VS Code 断点调试

1. **在 tsup 配置中确认 sourcemap 已开启**（默认已开启）：`tsup.config.ts` → `sourcemap: true`

2. **在 Node.js 进程中启用 inspect**：

```bash
node --inspect dist/index.js --http
```

3. **在 VS Code 中附加调试器**：
   - 按 `Cmd+Shift+P` → "Debug: Attach to Node Process"
   - 或使用以下 launch.json 配置：

```jsonc
{
  "name": "Attach to AgentILS HTTP",
  "type": "node",
  "request": "attach",
  "port": 9229,
  "sourceMaps": true,
  "outFiles": ["${workspaceFolder}/dist/**/*.js"]
}
```

4. **在源码中设置断点**，例如：
   - `src/gateway/tools.ts` — 工具注册和入口
   - `src/gateway/context.ts` — 请求上下文创建
   - `src/orchestrator/orchestrator.ts` — 编排逻辑

### 4.3 日志与错误输出

stdio 模式下：
- MCP 协议报文走 stdout
- 错误和日志走 stderr
- 未捕获异常和未处理 rejection 均会输出到 stderr

HTTP 模式下：
- 日志输出到控制台（stdout/stderr）
- HTTP 响应包含错误详情

可以通过重定向 stderr 来收集日志：

```bash
node dist/index.js 2>agentils-server.log
```

---

## 5. 运行测试

### 5.1 单元测试

AgentILS 使用 Node.js 内置 test runner + `tsx`：

```bash
npm run test:unit
```

此命令会运行 `test/**/*.test.ts` 下的所有测试文件。

### 5.2 运行单个测试文件

```bash
npx tsx --test test/gateway/request-context.test.ts
```

### 5.3 带过滤的测试

```bash
npx tsx --test --test-name-pattern="approval" test/**/*.test.ts
```

---

## 6. 架构要点速查

### 6.1 入口链路

```
src/index.ts
  └─ startIfEntrypoint()
       ├─ --http → startStreamableHttpServer()
       └─ 默认   → startStdioServer()

startStdioServer():
  createAgentGateServer()  → 创建 McpServer，注册 tools/prompts/resources
  StdioServerTransport     → stdin/stdout 通信

startStreamableHttpServer():
  createAgentGateServer()  → 每个 HTTP session 创建独立 runtime
  StreamableHTTPServerTransport → HTTP 长连接通信
```

### 6.2 核心模块

| 模块 | 路径 | 职责 |
|------|------|------|
| Gateway | `src/gateway/` | MCP Server 创建、工具注册、传输层 |
| Orchestrator | `src/orchestrator/` | 会话、任务、控制模式、验证编排 |
| Store | `src/store/` | 内存状态存储（runs, taskCards, handoffs）|
| Control | `src/control/` | 控制模式、门控评估、模式转换 |
| Types | `src/types/` | 核心类型合同定义 |

### 6.3 调试常见入手点

| 场景 | 起始文件 |
|------|---------|
| task start 不工作 | `src/gateway/tools.ts` → `src/orchestrator/conversation-orchestrator.ts` |
| approval/feedback 异常 | `src/gateway/tools.ts` → `src/orchestrator/control-mode-orchestrator.ts` |
| verify/summary 问题 | `src/orchestrator/verification-orchestrator.ts` → `src/store/summary-store.ts` |
| conversation 状态不对 | `src/store/conversation-store.ts` |

---

## 7. 环境变量参考

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `AGENT_GATE_HTTP_HOST` | HTTP 模式监听地址 | `127.0.0.1` |
| `AGENT_GATE_HTTP_PORT` | HTTP 模式监听端口 | `8788` |

---

## 8. 常见问题

### Q: stdio 模式下 Server 立即退出

确保 stdin 保持打开状态。AgentILS 已通过 `process.stdin.resume()` 防止进程因 stdin idle 退出。如果仍然退出，检查是否有其他代码消费了 stdin。

### Q: 构建后找不到 dist/index.js

运行 `npm run build` 确保 tsup 正常执行。如有错误，检查 `tsup.config.ts` 中的 entry 配置。

### Q: MCP Inspector 连接失败

确保安装了最新版 Inspector：`npx @modelcontextprotocol/inspector@latest`。同时确认 Node.js 版本 >= 20。
