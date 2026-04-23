# @agentils/mcp — AgentILS V1 控制平面

> **角色**：AgentILS 状态机的**唯一真值源**。完全独立于任何 IDE。
> **当前版本**：V1（task loop 收敛架构）。

## 一句话

一个独占式 HTTP MCP server，对外暴露 **3 个 tools** + **5 个 `state://` 投影 resources**，把 AgentILS V1 任务循环（`collect → plan → execute → test → summarize`）封装在 `run_task_loop` 里，让任何 MCP 客户端（Copilot、扩展、第三方）通过同一个端点驱动同一份状态机。

## 启动方式

### HTTP（默认，Plan C 单真值源）

```bash
node packages/mcp/dist/index.js
# AgentILS HTTP server listening at http://127.0.0.1:8788/mcp
```

- 默认监听 `127.0.0.1:8788/mcp`，端口被占时回退随机端口（自动改写 lock 文件）。
- 在 `~/.agentils/runtime-{sha1(workspace).slice(0,12)}.lock` 写入 `{ pid, host, port, endpoint, url, workspace }`，进程退出自动清理。
- 同一 workspace 第二次启动会读 lock，发现存活 peer 时直接退出，**保证全局只有一个 server**。

### stdio（兼容旧 MCP 客户端）

```bash
node packages/mcp/dist/index.js --stdio
```

仅在显式传 `--stdio` 时进入；不再是默认行为。

### 程序内启动（测试用）

```ts
import { startStreamableHttpServer, defaultConfig } from '@agentils/mcp'
const runtime = await startStreamableHttpServer(defaultConfig, { host: '127.0.0.1', port: 0 })
// runtime.url 给出真实 url；runtime.close() 关停
```

## 暴露给客户端的接口

### Tools（仅 3 个，`gateway/tools.ts`）

| Tool | 输入 | 作用 |
|------|------|------|
| `state_get` | `{ taskId? }` | 读取 `StateSnapshot`（活动 task + 待处理交互），不变更状态 |
| `request_user_clarification` | `{ question, context?, placeholder?, required? }` | 通过 MCP `elicitation/create` 协议向客户端要一段澄清文本 |
| `run_task_loop` | `RunTaskLoopInput`（见 `types/task.ts`） | 推动 V1 任务循环一步，返回 `RunTaskLoopResult` |

V1 之前的 `new_task_request` / `ui_task_start_gate` / `approval_request` / `feedback_gate` / `verify_run` / `ui_session_*` 等 tool **已全部移除**。所有任务推进通过 `run_task_loop` 的 `directive` 字段驱动。

### Resources（仅 `state://*`，`gateway/resources.ts`）

| URI | 内容 |
|-----|------|
| `state://current` | 当前活动 task 的 `StateSnapshot` |
| `state://{taskId}` | 指定 task 的 `StateSnapshot` |
| `state://controlMode/{taskId}` | 指定 task 的 `controlMode`（normal / alternate / direct） |
| `state://timeline/{taskId}` | 指定 task 的事件时间线 |
| `state://interaction/pending` | 当前待处理的 `TaskInteraction`（如果有） |

每个 HTTP 客户端连接都会拿到一个独立的 `ResourceNotifier`（注册到 orchestrator 的 `notifiers: Set`），断开时自动 dispose。**单 server，多 push 通道**。

## V1 状态机

### 阶段（`taskPhases`）

```
collect → plan → execute → test → summarize
```

`terminal`：`active | completed | failed | abandoned`。

### Loop directive（`loopDirectives`）

`noop | draft_plan | request_clarification | execute | execution_succeeded | execution_failed | tests_passed | tests_failed | finish`

### Loop next action（`loopNextActions`）

| 值 | 含义 |
|----|------|
| `recall_tool` | Caller 必须立即再次调用 `run_task_loop`（无人参与） |
| `await_webview` | 保持 tool 调用挂起，等 WebView/用户输入 |
| `return_control` | 任务到达终态，返回控制权 |

### 控制模式（`ControlMode`，`types/control-mode.ts`）

借鉴航空 ILS：`normal`（标准收敛）/ `alternate`（用户确认后执行）/ `direct`（最少干预）。

## 模块边界

| 目录 | 职责 |
|------|------|
| `src/gateway/` | MCP 协议入口：`server.ts`（创建 runtime + 注册）、`tools.ts`（3 个 tool）、`resources.ts`（5 个 state://）、`transports.ts`（HTTP + stdio）、`context.ts`（runtime + ResourceNotifier 契约）、`shared.ts`（textResult 等） |
| `src/orchestrator/` | 业务聚合：`orchestrator.ts`（V1 主循环：`runTaskLoop` / `stateGet` / `addNotifier`）、`conversation-orchestrator.ts`、`task-orchestrator.ts`、`control-mode-orchestrator.ts`、`verification-orchestrator.ts` |
| `src/store/` | 状态层（**纯内存**）：`memory-store.ts` 是真值源；`conversation-store.ts` / `task-store.ts` / `summary-store.ts` / `audit-store.ts` 是投影；`persistence/json-store.ts` 已实现但**当前未接入** |
| `src/runtime/` | `lock.ts`：lock 文件 + `pickFreePort` + `updateLockPort`（EADDRINUSE 回退后改写 lock） |
| `src/types/` | 类型契约：`task.ts`、`conversation.ts`、`control-mode.ts`、`session.ts` |
| `src/audit/` `src/budget/` `src/policy/` `src/control/` `src/control-plane/` `src/interaction/` `src/summary/` | 子领域辅助模块 |

## Gateway 边界规则

- Gateway 只做：解析输入 → 创建 request context → 调用 `ctx.elicitUser()` → 委托 orchestrator → `textResult()` 返回。
- **禁止** 在 gateway 直接写 store / 跨过 orchestrator 修改 task 状态。
- 每条 push 通知必须通过 `orchestrator.fanout(n => n.notifyTask(...))` 广播给所有已注册 notifier。

## ResourceNotifier 模式

```ts
// 多 HTTP client 共享同一个 orchestrator，每个 client 注册一次
const registration = orchestrator.addNotifier(runtime.notifier)
runtime.disposeNotifier = registration.dispose
// transport.onclose 时自动调 dispose 释放 push 通道
```

`setNotifier()` 仅保留向后兼容；新代码请用 `addNotifier()`。

## 开发约束

- **不引入任何 `vscode.*` 或 IDE 特定 API**。
- 修改前先按问题分类查阅链路（task start / approval / verify / summary / conversation state）。
- 所有领域写入必经 orchestrator；store 是真值源，gateway/resources 是投影。
- 测试先行：先定义 I/O 合同与 schema，再写实现。
- `ctx.elicitUser()` 走 MCP `elicitation/create`，超时设为 `2_147_483_647ms`（人类等待）。

## 验证命令

```bash
cd packages/mcp
pnpm tsc -p . --noEmit                  # typecheck
pnpm tsup                               # build to dist/
pnpm test                               # v1 单元测试
npx tsx --test \
  test/runtime/http-smoke.test.ts \
  test/runtime/phase3-feasibility.test.ts \
  test/runtime/phase4-feasibility.test.ts \
  test/runtime/phase4-integration.test.ts \
  test/runtime/phase3-e2e.test.ts       # runtime + e2e
```

全部通过 = MCP 控制平面就绪。

## 已知缺口

- **持久化未接入**：`store/persistence/json-store.ts` 提供了 `loadPersistentStore` / `resolveStateFilePath` / `AGENTILS_STATE_FILE` 但当前 0 引用，进程退出即丢全部状态。
- **TOCTOU 已收敛**：`pickFreePort` → `app.listen` 之间若被抢占，HTTP 层会捕 `EADDRINUSE` 回退 port=0，并通过 `updateLockPort()` 改写 lock 文件。
