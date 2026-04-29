# 实现层调试指引（impl-debug）

## 目的

这份文件用于在 AgentILS 仓库**沿调用链定位问题**时给 agent / 开发者一份**最小上下文**。
默认**不要全仓扫描**，按本文件给出的模块边界顺着链路读取即可。

> 真值源：`packages/mcp/src/`。本文件中所有以 `src/...` 开头的路径都默认指向 `packages/mcp/src/...`；扩展层路径会显式写 `extensions/agentils-vscode/...`，CLI 同理 `packages/cli/...`。

---

## 一、给 LLM agent 的提示词

### 1. 最小上下文调试

```text
你在 AgentILS 仓库工作。先只阅读 `docs/instructions/impl-debug.instructions.md`，不要先全仓扫描。

判断问题落在哪条 V1 主链路：
  A. tool 调用入口（state_get / request_user_clarification / run_task_loop）
  B. 任务循环阶段推进（collect → plan → execute → test → summarize）
  C. interaction 收发（pending / resolve）
  D. resource 推送（state://* + ResourceNotifier per-client fanout）
  E. runtime 启动 / lock 文件 / HTTP transport
  F. 扩展 thin bridge（runtime-client → webview-host）

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
  5. 改完至少跑：tsc --noEmit + 该链路的单元测试
```

### 3. 模块定位

```text
请按本文件判断这个问题属于哪条 V1 链路。先只输出：
  1. 主链路（A-F 之一）
  2. 入口模块
  3. 中间模块
  4. 真值源模块（必为 store/memory-store.ts）
  5. 需要继续打开的 1-3 个文件
```

---

## 二、V1 模块图

### 1. Gateway 层（协议入口，唯一对外）

| 文件 | 角色 |
|------|------|
| `src/gateway/server.ts` | 装配 store + orchestrator + transport，注册 tools / resources |
| `src/gateway/tools.ts` | `registerGatewayTools(runtime)`，仅 3 个 tool：`state_get` / `request_user_clarification` / `run_task_loop` |
| `src/gateway/resources.ts` | 5 个 `state://` resource：`state://current`、`state://{taskId}`、`state://controlMode/{taskId}`、`state://timeline/{taskId}`、`state://interaction/pending` |
| `src/gateway/context.ts` | `AgentGateRequestContext`：把 MCP `elicitation/create` 包成 `ctx.elicitUser()` |
| `src/gateway/transports/*` | HTTP（默认）+ stdio（兼容） |

> 凡是 V1 不存在的 tool（`new_task_request` / `approval_request` / `feedback_gate` / `verify_run` / `ui_session_*`）和 resource scheme（`taskcard://` / `handoff://` / `runlog://` / `policy://`）**已全部移除**，调试时**不要**假设它们存在。

### 2. Orchestrator 层（业务聚合，无状态）

| 文件 | 角色 |
|------|------|
| `src/orchestrator/orchestrator.ts` | `class AgentGateOrchestrator`：`runTaskLoop(input)` / `stateGet(taskId?)` / `addNotifier(notifier): { dispose }` / 私有 `fanout(fn)` |
| `src/orchestrator/conversation-orchestrator.ts` | conversation start / read / end |
| `src/orchestrator/task-orchestrator.ts` | V1 `TaskRecord` 阶段推进、`TaskInteraction` 发起与回收、控制模式转换、`TaskSummaryDocument` 拼装 |
| `src/orchestrator/control-mode-orchestrator.ts` | `normal` / `alternate` / `direct` 法则切换 + `OverrideState` |
| `src/orchestrator/verification-orchestrator.ts` | V1 测试阶段最小验证（`tests_passed` / `tests_failed`）+ summary 拼装 |

`notifiers: Set<ResourceNotifier>` —— 每个 HTTP client 独立注册，断开自动 dispose；`fanout` 把状态变更推给所有 client。

### 3. Store 层（唯一真值源）

| 文件 | 角色 |
|------|------|
| `src/store/memory-store.ts` | **V1 真值源**：`tasks` / `interactions` / `auditEvents` 等的内存表 + 高层读写 API |
| `src/store/conversation-store.ts` | conversation state 推导 |
| `src/store/task-store.ts` | `TaskRecord` / `TaskRecordView` / `TaskSummary` 投影 |
| `src/store/audit-store.ts` | 审计事件 |
| `src/store/summary-store.ts` | `TaskSummaryDocument` frontmatter 组装 |
| `src/store/persistence/json-store.ts` | 持久化逻辑（已实现，**当前 0 引用** —— 进程退出会丢全部状态，是 V1 已知缺口） |

### 4. Types 层（合同定义）

| 文件 | 关键类型 |
|------|----------|
| `src/types/task.ts` | `TaskRecord` / `TaskPhase` / `TaskTerminalState` / `TaskInteraction` / `loopDirective` |
| `src/types/conversation.ts` | `ConversationRecord` / `ConversationState` |
| `src/types/control-mode.ts` | `ControlMode = 'normal' \| 'alternate' \| 'direct'` / `OverrideState` |
| `src/types/session.ts` | session 视图聚合 |
| `src/summary/summary-schema.ts` | `TaskSummaryDocument` / `TaskSummaryFrontmatter` |

### 5. Runtime / 启动

| 文件 | 角色 |
|------|------|
| `src/index.ts` | bin 入口；解析 `--http` / `--stdio`；写/读 lock |
| `src/runtime/lock.ts` | `~/.agentils/runtime-{sha1(workspace).slice(0,12)}.lock`：`{pid, host, port, endpoint, url, workspace}`；`process.kill(pid, 0)` 探活 |

### 6. 扩展层（thin bridge）

`extensions/agentils-vscode/src/`：

| 文件 | 角色 |
|------|------|
| `extension.ts` | activate / 注册命令（`agentils.installPromptPack` / `agentils.openPanel`）/ 启动 runtime client |
| `runtime-client.ts` | HTTP MCP client；订阅 5 个 state:// resource；处理 `elicitation/create` 回调 |
| `webview-host.ts` | 创建 WebviewPanel；postMessage / onDidReceiveMessage |
| `webview-protocol.ts` | 扩展 ↔ webview 消息类型 |
| `webview-view-model.ts` | 把 state snapshot 投影成 webview 视图 |
| `tool-result-builder.ts` | 把 MCP tool 结果包成 chat 友好格式 |
| `types.ts` | 扩展内部类型 |
| `logger.ts` | 输出到 `~/.agentils/logs/vscode-extension/*.log` |

**禁止**在扩展层重新引入 V1 已删除的旧文件（`chat-participant.ts` / `session/` / `interaction-channel/` / `lm-tools/` / `mcp-elicitation-bridge.ts` / `task-service-client.ts` / `task-console-panel.ts` / `panel/`）。

---

## 三、V1 主链路与最小定位顺序

### 链路 A：tool 调用入口

```
client (Copilot / 扩展)
  → MCP transport (HTTP /mcp)
    → gateway/tools.ts: 校验 + 委托
      → orchestrator.runTaskLoop / stateGet
        → store/memory-store
          → fanout(notifier)
            → transport.resourceUpdated
              → client onResourceUpdate → 重新 stateGet
```

定位顺序：`gateway/tools.ts` → `orchestrator/orchestrator.ts` → `store/memory-store.ts`。

### 链路 B：任务循环阶段推进

```
caller 传 loopDirective → orchestrator.runTaskLoop
  → task-orchestrator: 阶段推进 (collect → plan → execute → test → summarize)
    → 写 store/memory-store
    → 计算 next.action: recall_tool | await_webview | return_control
```

定位顺序：`gateway/tools.ts` (run_task_loop) → `orchestrator/task-orchestrator.ts`。

### 链路 C：interaction 收发

```
orchestrator → 创建 TaskInteraction (pending)
  → ctx.elicitUser() (如果是 LLM 调用) 或 await_webview (如果是 WebView 输入)
    → 用户输入 → 扩展 webview → runtime-client → MCP elicitation/create response
      → orchestrator 回收 interaction → 写 store
```

定位顺序：`gateway/context.ts` → `orchestrator/task-orchestrator.ts` → `extensions/agentils-vscode/src/webview-host.ts`。

### 链路 D：resource 推送

```
orchestrator.fanout(notifier) → notifier.notify(uri)
  → HTTP transport: resourceUpdated 通知
    → 客户端 onResourceUpdate → 重新 fetch state_get
```

定位顺序：`orchestrator.addNotifier` → `gateway/transports/http.ts`。

### 链路 E：runtime 启动 / lock

```
node packages/mcp/dist/index.js
  → src/index.ts: parseArgs
    → src/runtime/lock.ts: acquireLock
      → 写 ~/.agentils/runtime-*.lock
    → 启动 HTTP server (默认 127.0.0.1:8788/mcp)
```

定位顺序：`src/index.ts` → `src/runtime/lock.ts`。

### 链路 F：扩展 thin bridge

```
EDH 启动 → extension.ts.activate
  → runtime-client.ts: 读 lock.url 或 fallback http://127.0.0.1:8788/mcp
    → 连接 MCP, 订阅 state://*
      → webview-host.ts: 创建 WebviewPanel
        → state 投影由 webview-view-model.ts 完成
```

定位顺序：`extension.ts` → `runtime-client.ts` → `webview-host.ts`。

---

## 四、调试总原则

1. **优先确认 I/O 合同，不先猜实现** —— 上游写了什么、下游要什么、中间改了什么。
2. **优先找真值源** —— V1 中是 `store/memory-store.ts`；任何"看起来是另一个真值源"的代码都应该被合并或删除。
3. **不重复计算** —— 同一份 ControlMode / TaskPhase / OverrideState **只能**从 store 读，禁止扩展或 webview 自己派生。
4. **resource 推送是被动的** —— 客户端**必须**收到 `resourceUpdated` 后再 `state_get`，禁止轮询。
5. **lock 是单例约束** —— 同一 workspace 下只能有 1 个 MCP server；启动前必须探活旧 PID。
