# 实现层调试指引（impl-debug）

## 目的

沿调用链定位问题时给 agent / 开发者一份**最小上下文**。默认**不要全仓扫描**，按本文件给出的模块边界顺着链路读。

> 真值源：`packages/mcp/src/` + `packages/extensions/agentils-vscode/src/` + `apps/webview/src/`。本文件中以 `mcp/...` 开头的路径指向 `packages/mcp/src/...`；扩展层路径写完整 `packages/extensions/agentils-vscode/src/...`；webview 写 `apps/webview/src/...`。

---

## 一、给 LLM agent 的提示词

### 1. 最小上下文调试

```text
你在 AgentILS 仓库工作。先只阅读 `docs/instructions/impl-debug.instructions.md`，不要先全仓扫描。

判断问题落在哪条主链路：
  A. LM tool 调用入口（4 个 elicitation tool 之一）
  B. orchestrator parked-promise（park / resolve / cancel / heartbeat-timeout）
  C. webview ↔ mcp HTTP/SSE
  D. 扩展 in-process 启动 mcp + 注册 tool
  E. CLI 注入 .vscode/mcp.json (stdio transport for Copilot)

只沿本文件给出的「模块 A → 模块 B」I/O 合同定位最小模块集合，不扩展到无关模块。

输出：
  - 问题所在链路
  - 最小相关模块
  - 关键入参 / 出参
  - 建议下一个打开的文件
```

### 2. 精准改动

```text
只允许沿本文件已定义的链路修改代码。

要求：
  1. 写出要改的链路
  2. 列出：上游模块、上游出参、下游模块、下游入参
  3. 说明当前不一致点
  4. 只改不一致点，不顺手重构
  5. 改完至少跑：tsc --noEmit + 该链路的单元测试 + pnpm -w lint
```

---

## 二、模块图（V1 当前）

### 1. mcp 业务核心（`packages/mcp/src/`）

| 文件                               | 角色                                                                                                                                                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mcp/index.ts`                     | `startAgentilsServer(opts)` 入口；导出 `Orchestrator` / `JsonStore` / `MemoryStore` / `createLogger` / `AgentilsClient` / 类型                                                                                                   |
| `mcp/orchestrator/orchestrator.ts` | parked promise map（`Map<requestId, {resolve, reject}>`）+ subscribers Set + version；`park` / `submit` / `cancel` / `pending` / `snapshot` / `sweepExpired`                                                                     |
| `mcp/store/interaction-store.ts`   | `InteractionStore` 接口（store 真值源契约）                                                                                                                                                                                      |
| `mcp/store/memory-store.ts`        | `MemoryStore` 默认实现（进程内）                                                                                                                                                                                                 |
| `mcp/store/json-store.ts`          | `JsonStore` 持久化到 `~/.agentils/state.json`（opt-in via `ServerOptions.statePath`）                                                                                                                                            |
| `mcp/transport/http.ts`            | Express HTTP + SSE；`POST /api/requests` / `POST /api/requests/:id/submit` / `POST /api/requests/:id/cancel` / `GET /api/state` / `GET /api/events`；`classifyParkRejection` 把 `'cancelled'` → 409，`'heartbeat-timeout'` → 408 |
| `mcp/transport/stdio.ts`           | MCP stdio transport（Copilot 通过 `.vscode/mcp.json` 拉起）                                                                                                                                                                      |
| `mcp/types/index.ts`               | `ToolName`(4)/`InteractionRequest`/`InteractionResponse`/`InteractionStatus`(`pending\|submitted\|cancelled\|expired`)/`StateSnapshot`/`StateChangedReason`(6)/`ServerOptions`                                                   |
| `mcp/client/index.ts`              | `AgentilsClient`：`health()` / `park({toolName, question, context?, placeholder?, action?, params?})`                                                                                                                            |
| `mcp/interaction/response.ts`      | `cancelledInteractionResponse` / `timeoutInteractionResponse` / `normalizeInteractionResponse`                                                                                                                                   |
| `mcp/util/logger.ts`               | `createLogger` + `startHttpLogServer`（默认 12138，调试用）                                                                                                                                                                      |

### 2. VS Code 扩展（`packages/extensions/agentils-vscode/src/`）

| 文件                     | 角色                                                                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extension.ts`           | `activate()` in-process 启 mcp HTTP bridge（httpPort:0）+ 构造 `AgentilsClient` + `AgentilsWebviewManager` + 注册 2 命令 + 4 LM tool；导出 `AgentilsExtensionApi` |
| `logging.ts`             | `createExtensionLogger`：OutputChannel + 500 行 ring buffer                                                                                                       |
| `tools/registerTools.ts` | `TOOL_BINDINGS`（4 个 lmId↔ToolName）+ `vscode.lm.registerTool` + `traceId = lm-{lmId}-{ts}-{rand}`                                                               |
| `tools/toolResult.ts`    | `buildToolResultFromResponse` / `buildCancelledToolResult`（HTTP 409）/ `buildHeartbeatTimeoutToolResult`（HTTP 408）                                             |
| `webview/manager.ts`     | `AgentilsWebviewManager.ensurePanel()`：单 panel 复用，注入 `baseUrl`                                                                                             |
| `webview/protocol.ts`    | host ↔ webview 消息类型，与 `apps/webview/src/protocol.ts` mirror                                                                                                 |

**禁止**假设以下 V1 中间形态文件存在：`runtime-client.ts` / `webview-host.ts` / `webview-view-model.ts` / `tool-result-builder.ts` / `chat-participant.ts` / `lm-tools/` / `mcp-elicitation-bridge.ts` / `task-service-client.ts`。

### 3. WebView 应用（`apps/webview/src/`）

| 文件                               | 角色                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `App.tsx`                          | 入口；`EventSource('/api/events')` 直连 mcp SSE 拉 `StateSnapshot`；postMessage 走 `protocol-bridge.ts` |
| `main.tsx`                         | React 挂载                                                                                              |
| `bridge.ts` / `protocol-bridge.ts` | 与扩展 host 的 postMessage 桥（语义函数）                                                               |
| `protocol.ts`                      | 与 `packages/extensions/agentils-vscode/src/webview/protocol.ts` mirror                                 |

### 4. CLI（`packages/cli/src/index.ts`）

`init` / `uninstall`，把 stdio mcp server 写进 `.vscode/mcp.json`，把 25 个 `agentils.*` 模板写进 `.github/{prompts,agents}/` 或用户级 prompts 目录。

### 5. 内部 backup（`packages/{cli,mcp}.back/`）

V0 冻结备份；**禁止**以为它们的代码（`gateway/` / `runtime/lock.ts` / `ResourceNotifier` / `addNotifier` / `fanout` / `chat-participant.ts`）还存在 V1 主线。

---

## 三、主链路与最小定位顺序

### 链路 A：LM tool 调用入口

```
Copilot LM
  → vscode.lm.registerTool invoke (agentils_request_user_clarification 等)
    → tools/registerTools.ts.handler
      → client.park({toolName, question, context?, ...})
        → POST /api/requests (mcp HTTP)
          → orchestrator.park() → 写 store + 加 parked promise
            → SSE 推 'request.created' → webview 渲染
```

最小定位：`tools/registerTools.ts` → `mcp/client/index.ts` → `mcp/transport/http.ts` → `mcp/orchestrator/orchestrator.ts`。

### 链路 B：响应回流（user 提交）

```
webview submit → fetch POST /api/requests/:id/submit
  → mcp/transport/http.ts → orchestrator.submit(requestId, response)
    → 写 store (status: 'submitted') → resolve parked promise
      → registerTools handler 收到 → buildToolResultFromResponse
        → return LanguageModelToolResult → Copilot LLM
```

最小定位：`apps/webview/src/protocol-bridge.ts` → `mcp/transport/http.ts` → `mcp/orchestrator/orchestrator.ts` → `tools/toolResult.ts`。

### 链路 C：cancel / heartbeat-timeout

```
client.park promise reject('cancelled')   → http: 409 → buildCancelledToolResult
client.park promise reject('heartbeat-timeout') → http: 408 → buildHeartbeatTimeoutToolResult
（其它 → 透传 throw）
```

`heartbeat-timeout` 由 `orchestrator.sweepExpired()` 触发；扫描间隔 = `ServerOptions.sweepIntervalMs`，超时阈值 = `heartbeatTimeoutMs`。测试可用 env：`AGENTILS_TEST_HEARTBEAT_MS` / `AGENTILS_TEST_SWEEP_MS`。

最小定位：`mcp/orchestrator/orchestrator.ts.sweepExpired` → `mcp/transport/http.ts.classifyParkRejection` → `tools/toolResult.ts`。

### 链路 D：扩展 activate 启动

```
onStartupFinished
  → extension.ts.activate
    → startAgentilsServer({stdio:false, http:true, httpPort:0})
      → server.http.port = OS-assigned port → baseUrl
        → new AgentilsClient({baseUrl}) + client.health()
          → new AgentilsWebviewManager(ctx, baseUrl, log)
            → registerTools(ctx, client, webviewManager, channel)
              → 4 vscode.lm.registerTool + 2 commands
```

最小定位：`packages/extensions/agentils-vscode/src/extension.ts` → `mcp/index.ts.startAgentilsServer` → `mcp/transport/http.ts`。

### 链路 E：Copilot 走 stdio 直连 mcp

```
用户 npx @agent-ils/cli init --workspace .
  → packages/cli/src/index.ts.injectMcpJson
    → .vscode/mcp.json: { agentils: { type:'stdio', command:'npx', args:['-y','@agent-ils/mcp','--stdio'] } }
      → Copilot 启动时 spawn 此子进程
        → mcp/index.ts 检测 --stdio → mcp/transport/stdio.ts 启
          → tool 调用走 MCP stdio JSON-RPC
```

最小定位：`packages/cli/src/index.ts.injectMcpJson` → `mcp/index.ts` 入口 → `mcp/transport/stdio.ts`。

---

## 四、调试总原则

1. **优先确认 I/O 合同，不先猜实现** —— 上游写了什么、下游要什么、中间改了什么
2. **优先找真值源** —— V1 的 InteractionRequest / InteractionResponse 真值源是 `mcp/store/`（默认 MemoryStore；可选 JsonStore 持久化）；任何"看起来是另一个真值源"的代码都应该被合并或删除
3. **不重复计算** —— webview 不能自己派生 `interactions[]`、状态字段；只读 SSE 推送的 `StateSnapshot`
4. **SSE 是被动推送** —— 客户端**必须**等 SSE 事件再 fetch 详情，禁止轮询
5. **扩展启动同时只能有一份 in-process mcp** —— 每个 extension host 实例独立；多个 EDH 端口不会冲突（httpPort:0）
