# packages/mcp 开发规则

定义 `packages/mcp`（AgentILS 控制平面）的边界、模块职责、调用链路和约束。本文件是 mcp 实现细节的真值源；任何引用 mcp tool / endpoint / type 的下游文档以本文为准。

> 跨包总则参见 [`agentils.instructions.md`](agentils.instructions.md)。本文件**只描述 mcp 包内部**，不重复总则。

## 核心定位

`packages/mcp` 是 AgentILS 的**唯一状态机真值源**和**业务逻辑控制平面**。完全独立于 IDE，对外通过 MCP elicitation tool + HTTP bridge + SSE 暴露状态与交互能力。

**禁止事项**：

- 引入任何 IDE 特定 API（`vscode.*` 等）
- 在此包内处理 UI 渲染或交互展示逻辑
- 在多个模块重复计算核心状态（违反单向数据流）
- 假设当前 4 个 tool 之外有其它 tool 名存在（V0 / V1 早期 `state_get` / `run_task_loop` / `new_task_request` / `approval_request` / `feedback_gate` / `verify_run` / `ui_session_*` 全部已移除）
- 假设存在 `state://*` MCP resource、`ResourceNotifier`、`gateway/`、`addNotifier/setNotifier/fanout`、`acquireRuntimeLock`、`TaskRecord/TaskInteraction/TaskSummaryDocument` 这些 V1 中间形态——**已全部从仓库删除**（V0 备份目录 `packages/mcp.back/` / `packages/cli.back/` 也已移除），只在 git history 中可见

## 模块布局（`packages/mcp/src/`）

```
index.ts                  # entry: startAgentilsServer + CLI bootstrap
client/index.ts           # AgentilsClient: 给扩展用的 thin HTTP 客户端
interaction/response.ts   # 取消 / 超时 / 规范化 InteractionResponse 工具
orchestrator/orchestrator.ts  # 单一 Orchestrator（parked-promise 池 + SSE 广播 + sweep）
store/
  interaction-store.ts    # InteractionStore 接口 + emptyState 工厂
  memory-store.ts         # 默认实现：内存版 PersistedState
  json-store.ts           # 可选：~/.agentils/state.json 持久化（已 export，调用方自选）
transport/
  http.ts                 # startHttpBridge：Express + SSE
  stdio.ts                # startStdioTransport：MCP stdio 通道
types/index.ts            # 4 个 tool 名、所有交互类型、StateSnapshot、ServerOptions
util/logger.ts            # createLogger + startHttpLogServer (默认 12138)
```

## 对外契约（**改任何一项都必须同步下游 instruction + README**）

### 1. Elicitation tool（4 个，定义在 `types/index.ts`）

```ts
export type ToolName =
    | 'request_user_clarification' // 问澄清，等用户答
    | 'request_contact_user' // 主动联系用户（推送式）
    | 'request_user_feedback' // 收任务结束反馈
    | 'request_dynamic_action' // 自定义 action + params 任意载荷
```

所有 tool 共用同一套 elicitation 流程：调用 → orchestrator 创建 `InteractionRequest` → parked-promise 挂起 → UI 通过 HTTP 提交 `InteractionResponse` → resolve 唤醒原 tool 调用并返回。

### 2. `InteractionRequest` / `InteractionResponse`（`types/index.ts`）

- `InteractionRequest { id, toolName, question, context?, placeholder?, action?, params?, createdAt, lastHeartbeatAt, traceId, status }`
- `InteractionStatus = 'pending' | 'submitted' | 'cancelled' | 'expired'`
- `InteractionResponse { text, images?, reportContent?, cancelled?, timestamp, reason? }`
- `traceId` 跨 mcp / 扩展 / CLI / logger 关联同一生命周期，**不要丢**
- `lastHeartbeatAt` 由 UI 心跳推进；超过 `heartbeatTimeoutMs`（`ServerOptions.heartbeatTimeoutMs`，默认 1 小时）会被 `Orchestrator.sweepExpired()` 标 `expired` 并 reject 对应 parked-promise（reason `'heartbeat-timeout'`）

### 3. `StateSnapshot`（read model）

```ts
{
  version,                 // 自增；每次状态变更 +1
  generatedAt,
  heartbeatTimeoutMs,
  interactions: { pending, submitted, cancelled, expired, responses },
  errors: [{ message, detail?, timestamp }],
}
```

是给扩展 / WebView / 其它消费方的**唯一状态读模型**。不要单独读 `MemoryStore` 内部字段。

### 4. SSE event reasons（`StateChangedReason`）

```
state.replayed | request.created | interaction.submitted
| interaction.cancelled | interaction.heartbeat | interaction.expired
```

### 5. HTTP bridge endpoints（`transport/http.ts`，默认 `http://127.0.0.1:8788`）

```
GET  /api/health
GET  /api/state                  → { ok, snapshot: StateSnapshot }
GET  /api/requests/pending       → { requests: InteractionRequest[] }
GET  /api/events                 → SSE: state.changed / request.* / heartbeat ping (15s)
POST /api/requests               → 扩展 bridge 用：创建 + park（等价于 elicitation tool 调用）
POST /api/requests/:id/submit    → UI 提交响应；HTTP 状态码 409=cancelled / 408=heartbeat-timeout / 500=other
POST /api/requests/:id/cancel
POST /api/requests/:id/heartbeat
```

### 6. `ServerOptions`（`types/index.ts`）

```ts
{
  statePath?,             // 默认 ~/.agentils/state.json（仅当显式接 JsonStore 时落盘）
  httpPort?,              // 默认 8788
  logServer?,             // 默认 true
  logPort?,               // 默认 12138
  logDir?,                // 默认 <cwd>/.agent-ils/logger/logs
  heartbeatTimeoutMs?,    // 默认 60 * 60_000
}
```

## 入口与启动

`startAgentilsServer(opts)` 是**唯一公开入口**（`src/index.ts`）。返回 `RunningServer { orchestrator, store, http?, logServer?, stop }`。

CLI flags（`process.argv[1]` 是本包时生效）：

- `--stdio` — 启 stdio transport
- `--stdio-only` — 启 stdio transport 但禁用 HTTP bridge
- `--http` / `--http-only` — 启 HTTP bridge（默认 8788）
- 不带 flag → 二者都启（推荐：VS Code 扩展 in-process + Copilot stdio 共享）

`packages/extensions/agentils-vscode` 的 `extension.ts` 直接 in-process `import { startAgentilsServer }` 启同一份 orchestrator；Copilot 通过 `.vscode/mcp.json` 的 stdio 配置（由 `packages/cli init` 写入）连**同一进程**。

## Orchestrator 内部模型

```ts
class Orchestrator {
    private parked: Map<requestId, { resolve; reject }>
    private subscribers: Set<(SseEvent) => void>
    private version: number // 单调自增
    pending(): InteractionRequest[]
    snapshot(): StateSnapshot
    sweepExpired(): void // index.ts setInterval 30s 调一次
    // park / submit / cancel / heartbeat / subscribe（详见源码）
}
```

要点：

- 一个 tool 调用对应一个 parked promise；UI submit 时 resolve；cancel/expire 时 reject 一个**确切的 Error.message**（`'cancelled'` / `'heartbeat-timeout'`），HTTP 层据此分类返回 `409 / 408 / 500`，扩展 `vscode.lm.registerTool` 接到后透传给 LLM
- 所有状态变更后必须 `version++` 并 broadcast；订阅者（HTTP SSE / 未来 stdio 通知）凭 version 去重
- `parked` map 与 `store` 是两份不同视图：`store` 保留所有历史（含 expired），`parked` 只挂活的 promise

## Store 三件套

- `interaction-store.ts` —— `InteractionStore` 接口 + `emptyState()` 工厂；任何替代实现都要满足这个接口
- `memory-store.ts` —— 默认实现，进程退出即丢
- `json-store.ts` —— 可选持久化，落 `~/.agentils/state.json`（路径由 `ServerOptions.statePath` 覆盖）；当前 `index.ts` 默认仍用 `MemoryStore`，需要持久化的调用方自己 `new JsonStore(...)` 注入

## 典型调用链：单次澄清

```
LLM (Copilot)
  → vscode.lm.registerTool 'agentils_request_user_clarification' invoke handler
    → AgentilsClient.park({ toolName: 'request_user_clarification', question, ... })
      → POST /api/requests （HTTP bridge）
        → Orchestrator: 生成 InteractionRequest, store.upsertRequest, parked.set(id, {resolve,reject})
          → broadcast SSE 'request.created'
            → WebView (apps/webview) 收到 → 渲染表单
              → 用户提交 → POST /api/requests/:id/submit
                → Orchestrator: store.putResponse, parked.get(id).resolve(response)
                  → HTTP 返回；扩展端 park() promise resolve
                    → tool invoke handler 把 response.text 返回给 LLM
                  → broadcast SSE 'request.submitted'
```

## 边界规则

- `transport/*` 只做协议转换 + 鉴别参数 → 调 `Orchestrator.<method>` → 序列化结果。**禁止**直接读写 `store`
- `store/*` 不感知 HTTP / SSE / promise，纯 CRUD + 事件无关
- `Orchestrator` 是唯一可以同时 touch `store` + `parked` + `subscribers` 的角色
- `client/index.ts` 是**外部消费方**用的 HTTP 客户端，不允许 import `orchestrator` / `store`（否则就违反 in-process vs out-of-process 边界）

## 持久化语义

- 默认 `MemoryStore` 进程退出即丢；这是显式选择，不是 bug
- 启用 `JsonStore` 后才能 replay；replay 走 `Orchestrator` 构造函数里 `store.listPending()` 重建 `pending` 视图（注意：parked promise 没法 replay——重启后 pending 仍可见但不会自动 resolve 之前 LLM 的 tool 调用）

## 测试与验证

```bash
cd packages/mcp
pnpm tsc -p . --noEmit       # 类型
pnpm tsup                     # 构建
pnpm test                     # 单元 + e2e
```

新增 tool / endpoint / 字段时**先写测试再写实现**（参见总则 Rule 5）：覆盖反向用例（非法输入 / 边界值 / 状态机非法转移 / 并发 / 依赖故障）。
