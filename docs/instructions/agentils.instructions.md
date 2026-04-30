# AgentILS 通用开发规则

> **⚠️ 本文件是开发指引**，面向 AgentILS 项目本身的开发者。
> 通过 `sync-manifest.json` 同步到 `.github/instructions/agentils.instructions.md` + `AGENTS.md`，供 Copilot/Codex 在开发 AgentILS 时读取。
> **本文件不应被 `packages/cli` 读取或注入到外部用户项目。** CLI 有自己独立的模板体系（`packages/cli/templates/`），内容是面向用户的行为约束。

## 仓库结构（Plan C / V1）

| 包               | 路径                         | 角色                                                                       |
| ---------------- | ---------------------------- | -------------------------------------------------------------------------- |
| **MCP 控制平面** | `packages/mcp`               | 单一 HTTP MCP server（默认 `http://127.0.0.1:8788/mcp`），唯一状态机真值源 |
| **VS Code 扩展** | `extensions/agentils-vscode` | thin bridge：HTTP MCP client + WebView，**不**承载业务逻辑                 |
| **CLI 配置工具** | `packages/cli`               | 仅 VS Code 配置注入器（`install vscode` / `uninstall vscode`）             |

## 核心原则

### 单一真值源 + Plan C 单 server

- 每个工作区**只能有一个运行中的 MCP HTTP server**，由 `~/.agentils/runtime-{sha1(workspace).slice(0,12)}.lock` 协调。
- Copilot（通过 `.vscode/mcp.json`）和扩展（通过 `runtime-client`）连接**同一个** server，看到**同一份**状态。
- 扩展在 `openPanel` 时调用 `runtimeClient.getCurrentLock()` 同步 `.vscode/mcp.json` 的 url，防止 8788 被占时配置漂移。

### 三层职责边界

- **packages/mcp** 管理所有状态和业务逻辑（V1 task loop：`collect → plan → execute → test → summarize`，控制模式 `normal/alternate/direct`，directive、interaction、override 全部在此）。
- **extensions/agentils-vscode** 只做 UI 渲染、订阅 `state://` resources、转发 elicitation 与用户交互；**禁止**实现业务规则。
- **packages/cli** 只做配置注入；**禁止**包含运行时业务、**禁止**读 `docs/instructions/`。

修改代码前确认变更属于哪个包；跨边界修改应被阻止。

### 单向数据流

```
Gateway (输入) → Orchestrator (逻辑) → memory-store (真值源)
                                        ↓
                            投影 (state:// resources, view-model)
                                        ↓
                            HTTP push (ResourceNotifier per client)
```

命令可以从多个入口进入；派生状态只有一个真值源；禁止在多个模块重复计算核心状态。

### V1 暴露契约（外部唯一可信契约）

- **MCP tools**（`packages/mcp/src/gateway/tools.ts`）：`state_get`、`request_user_clarification`、`run_task_loop`。**不要**在文档/模板/客户端假设其它 tool 还存在。
- **MCP resources**（`packages/mcp/src/gateway/resources.ts`）：`state://current`、`state://{taskId}`、`state://controlMode/{taskId}`、`state://timeline/{taskId}`、`state://interaction/pending`。
- **CLI 命令**（`packages/cli/src/index.ts`）：`install vscode` / `uninstall vscode` / `--help`，仅 vscode。

### 持久化现状

`memory-store.ts` 是**纯内存**真值源，进程退出即丢。`store/persistence/json-store.ts` 已实现 load/save，但**当前 0 引用**。任何持久化需求需明确接入计划，禁止在文档中暗示"已持久化"。

## 交互协议

- MCP 通过 `ctx.elicitUser()`（即 `server.server.elicitInput`）发起用户交互，超时 `2_147_483_647ms`。
- MCP 不关心客户端 UI 形态。当前已实现的承接者只有 `extensions/agentils-vscode`。
- 无承接者时，elicitation 请求会挂起或失败 —— 这是"链路断裂"，不是"UI 简化"。

## 开发规范

- 读取顺序：先 `AGENTS.md`，再 `docs/instructions/impl-debug.instructions.md`，然后按问题分类查阅模块。
- 不要一开始就全仓扫描；从当前调用链和模块边界出发。
- 先分类问题主链路：`task loop step` / `state read` / `state push` / `clarification` / `HTTP transport` / `VS Code activation` / `CLI inject`。
- 优先采用测试先行；先定义 I/O 合同与 schema，再实现。
- 修改前对齐上下游 I/O 合同；优先信类型，不靠运行时猜测。
- 用 MCP resources 暴露状态可见性，而非藏在 prompt state 里。
- 区分 task completion（任务终态）和 conversation completion（对话结束）；新任务入口必须显式。

## Gateway 边界规则

- Gateway 只做：解析输入 → 创建 request context → `ctx.elicitUser()` → 委托 orchestrator → `textResult()` 返回。
- **禁止** Gateway 直接执行域写入（task 状态转移、override 更新、controlMode 转换都属于 orchestrator）。

## ResourceNotifier 模式（重要）

每个 HTTP client 连接独立注册 notifier；orchestrator 用 `Set<ResourceNotifier>`：

```ts
const registration = orchestrator.addNotifier(runtime.notifier)
runtime.disposeNotifier = registration.dispose
// transport.onclose → runtime.disposeNotifier()
// 广播：orchestrator.fanout(n => n.notifyTask(taskId))
```

`setNotifier()` 仅向后兼容；新代码用 `addNotifier()`。

## 执行法则（Control Modes，航空 ILS 致敬）

| 法则     | 值            | 特征                                       |
| -------- | ------------- | ------------------------------------------ |
| 正常法则 | `'normal'`    | 标准收敛链路                               |
| 备用法则 | `'alternate'` | 用户确认后执行（提高控制权）               |
| 直接法则 | `'direct'`    | 最少干预，用户掌控方向（审计可见性不减少） |

## V1 任务阶段

`collect → plan → execute → test → summarize`；终态：`active | completed | failed | abandoned`。

不得在 verification 与 summary 状态对齐前标记任务完成。
高风险操作需通过 elicitation 显式确认或 user override。

## 命名约定

- 项目名固定 **AgentILS**（不写成 Agentils / agentils 等变体）。
- npm 包名：`@agent-ils/mcp`、`@agent-ils/cli`；扩展 publisher：`bugfix2020`。
- HTTP MCP 端点：默认 `http://127.0.0.1:8788/mcp`，可通过 `AGENTILS_HTTP_PORT` / `AGENTILS_HTTP_HOST` 覆盖。
