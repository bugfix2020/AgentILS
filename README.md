# AgentILS

AgentILS 是一个面向 VS Code agent 工作流的 MCP control plane 骨架。仓库现已改造成 `pnpm workspace + turbo` monorepo，分为 `packages/mcp`、`extensions/agentils-vscode`、`packages/cli` 三个主包。当前版本重点不是“多功能工具箱”，而是把任务推进纪律显式化：

- 先分诊模式，再进入执行
- 用 `taskCard` 和 `handoffPacket` 承载结构化状态
- 用 budget、policy、approval、verify 控制 run 生命周期
- 用 hooks 为“未确认不得结束”预留硬门禁
## 🔴 最高原则（Hard Constraint）

> **Chat 永不结束，除非用户显式关闭**

这意味着：
- 单次 LLM invocation（一条 Chat 消息）内，用户可进行**多轮澄清和交互**
- LLM 作为驱动力，通过调用 MCP tools 来推进交互流程
- webview 作为交互界面，所有用户输入都应导致 **LLM 继续推理**，而非直接处理
- 禁止任何操作导致 Chat 消息提前结束
## GitHub 仓库信息

当前公开仓库是：

- [bugfix2020/AgentILS](https://github.com/bugfix2020/AgentILS)

当前存在一层命名分离：

- GitHub 仓库名：`AgentILS`
- 当前 npm 包名：`agentils`
- 当前 CLI 名：`agentils`
- 当前 MCP server 展示名：`AgentILS`

这样做是为了先保持运行入口和本地安装方式稳定。后续如果要统一发布名，可以再单独做一次重命名迁移。

## 三层架构

### 1. packages/mcp - 业务逻辑控制平面

**职责**：完整的状态机、任务生命周期管理、人机交互逻辑，**完全独立于 IDE**

- MCP Server（stdio/HTTP）- 与 Extension 的独立通信服务
- Orchestrator（业务逻辑聚合）- 四个 orchestrator（conversation/task/control-mode/verification）
- Store（状态管理）- 运行态和持久化状态真值源
- Tools & Prompts（对外接口）- 供 LLM 调用的工具和提示词

**关键职责**：
- 通过 `ctx.elicitUser()` 与 Extension webview 进行双向交互
- 维护 session 生命周期，每个 session 承载待处理交互状态
- 在**单个 LLM invocation 内**支持多轮用户澄清

详见 [packages/mcp/README.md](packages/mcp/README.md)

### 2. extensions/agentils-vscode - VS Code 交互层

**职责**：MCP 的 IDE 适配，webview UI、会话管理、LM 工具注册，**不承载业务逻辑**

- Webview UI（React + Ant Design）- 用户交互面板
- MCP 桥接（stdio 子进程）- 与 MCP Server 的双向通信
- 会话管理（ConversationSessionManager）- 在 Extension 侧维护会话状态投影
- Chat Participant 和 LM Tools - 暴露 MCP tools 给 Copilot Chat

**关键职责**：
- webview 的两类用户输入：
  - `submitPendingInteraction`：回应 MCP 的 elicitation 请求
  - `submitSessionMessage`：自由会话消息 → 追加到 MCP transcript → 触发 LLM 继续推理
- 所有用户操作都应让 LLM 继续调用 MCP tools，保证 Chat 不结束

详见 [extensions/agentils-vscode/README.md](extensions/agentils-vscode/README.md)

### 3. packages/cli - 跨 IDE 配置工具

**职责**：为不同 IDE（VS Code、Cursor、Codex、Antigravity）生成标准化配置文件

详见 [packages/cli/README.md](packages/cli/README.md)

## 有插件 vs 无插件的表现形式

### 有 VS Code Extension 的情况（完整）

```
用户输入 "@agentils" in Copilot Chat
         ↓
 Extension @agentils Chat Participant 响应
         ↓
 Extension 启动 webview（任务控制台）
         ↓
 LLM 通过 HTTP 调用 MCP tools（如 request_user_clarification）
         ↓
 MCP 通过 ElicitationBridge 发起交互请求到 Extension webview
         ↓
 用户在 webview 填充信息或输入消息
         ↓
 webview postMessage → Extension → ElicitationBridge → MCP
         ↓
 MCP 更新 session 状态，runner 恢复下一轮
         ↓
 LLM 调用下一个 MCP tool 或继续推理
         ↓
 循环直到任务完成或用户关闭 webview
```

**特点**：
- Chat 永不结束（用户多轮交互在单个 Chat 消息内）✓
- 支持 webview UI 的丰富交互（文件选择、多媒体、表单等）✓
- Extension 作为 IDE 集成层，MCP 侧无需关心 IDE 细节

### 无 VS Code Extension 的情况（纯 MCP）

```
直接启动 MCP server: node packages/mcp/dist/index.js
         ↓
外部 LLM client（如直接调用 Claude API）通过 MCP protocol 调用 tools
         ↓
 MCP 接收 tool calls，执行业务逻辑
         ↓
 当需要用户交互时，ctx.elicitUser() 无处可发（没有 Extension）
         ↓
 **表现为**：tool 返回 error 或 pending 状态
```

**特点**：
- 纯业务逻辑验证和 MCP 协议测试用途
- 不支持 webview UI（无 IDE 环境）
- 不满足"Chat 永不结束"约束（MCP 为无状态 tool server）

## Session-Driven Continuation 架构

用户输入的两类处理方式确保 Chat 连续性：

### 1. `submitPendingInteraction`

**来源**：MCP 发起的 approval/feedback/clarification elicitation

**流程**：
```
webview 显示待处理交互 UI
   ↓
用户提交回复
   ↓
webview.postMessage({ action: 'submitPendingInteraction', ... })
   ↓
Extension → ElicitationBridge → MCP
   ↓
MCP 更新 session 状态，继续 runner
   ↓
（runner 可能继续调用 tools 或结束）
```

### 2. `submitSessionMessage`

**来源**：用户在长期任务控制台的自由输入

**流程**：
```
webview 显示历史消息 + 输入框
   ↓
用户输入 → 点击提交
   ↓
webview.postMessage({ action: 'submitSessionMessage', text: '...' })
   ↓
Extension → MCP（追加到 transcript）
   ↓
MCP runner 读取新 user message
   ↓
runner 调用 request.model.sendRequest() 重新推理
   ↓
assistant chunk 流回 webview（通过状态更新）
   ↓
LLM 可能调用新的 tools，继续交互
```

**关键保证**：无论是哪种输入，都会导致 LLM 继续推理或 tool 继续执行，Chat 消息永不结束（直到用户关闭或显式完成）

**职责**：参数解析、配置分发、多 IDE 支持（VS Code、Cursor、Codex 等）

- CLI 参数解析
- 配置文件注入
- 多 IDE 适配

详见 [packages/cli/README.md](packages/cli/README.md)

## 三项目关系

```
┌─────────────────────────────────────┐
│ VS Code Extension                   │
│ (extensions/agentils-vscode)        │
│                                     │
│ ┌──────────────────────────────┐   │
│ │ Webview (React UI)           │   │
│ └────────────────┬─────────────┘   │
│                  │ postMessage      │
│ ┌────────────────▼─────────────┐   │
│ │ Extension (Task Service)     │   │
│ └────────────────┬─────────────┘   │
│                  │ HTTP/MCP         │
└──────────────────┼──────────────────┘
                   │
        ┌──────────▼──────────┐
        │ MCP Server          │
        │ (packages/mcp)      │
        │                     │
        │ - Orchestrator      │
        │ - Store             │
        │ - Tools/Prompts     │
        │ - Elicitation       │
        └─────────────────────┘

┌──────────────────────────────────┐
│ CLI Tool (packages/cli)           │
│ - npm install -g @agentils/cli   │
│ - agentils inject                │
│ - Writes config to IDE folders   │
└──────────────────────────────────┘
```

### 数据流

**初始化**：
1. 用户在 VS Code 中执行 `agentils inject` 或通过 CLI 注入配置
2. VS Code 通过 `.vscode/mcp.json` 启动 MCP Server 进程
3. Extension 连接到 MCP，初始化会话

**任务流程**：
1. 用户在 Copilot Chat 执行 `@agentils` 命令
2. Chat Participant 调用 sessionManager.startTaskGate()
3. Extension 通过 HTTP 或 MCP tools 调用 MCP 的 ui_task_start_gate
4. MCP 业务逻辑处理，可能通过 `elicitUser()` 触发 webview 交互
5. Extension 接收 elicitation，在 webview 显示交互 UI
6. 用户输入 → webview postMessage → Extension → MCP elicitation bridge 路由回 MCP
7. MCP 继续执行，返回结果投影到 Extension 的会话状态

## 当前范围

当前仓库已经落下的核心模块：

- [packages/mcp/src/gateway/gateway.ts](packages/mcp/src/gateway/gateway.ts)
- [packages/mcp/src/orchestrator/orchestrator.ts](packages/mcp/src/orchestrator/orchestrator.ts)
- [packages/mcp/src/store/memory-store.ts](packages/mcp/src/store/memory-store.ts)
- [packages/mcp/src/types/index.ts](packages/mcp/src/types/index.ts)

当前版本已经具备可落盘的 run state 和 hooks 闭环，已具备：

- `run_start`
- `run_get`
- `taskcard_get`
- `taskcard_put`
- `handoff_get`
- `handoff_put`
- `budget_check`
- `policy_check`
- `audit_append`
- `verify_run`
- `approval_request`
- `feedback_gate`

同时暴露 4 个 prompts：

- `agentgate_start_run`
- `agentgate_resume_run`
- `agentgate_verify_run`
- `agentgate_prepare_handoff`

以及 4 个 resources：

- `taskcard://{runId}`
- `handoff://{runId}`
- `runlog://{runId}`
- `policy://current`

## 开发者使用

完整流程文档在这里：

- [Developer Guide](/Users/liuyuxuan/Desktop/Lenovo/agent-gate/docs/agentils/developer-guide.md)

覆盖内容包括：

- 本地开发与调试
- npm 发布前检查与发布命令
- npm 安装方式
- VS Code 通过 `.vscode/mcp.json` 接入
- VS Code / Copilot Chat 中如何调用 tools、prompts、resources

## 目录

```text
packages/
├─ mcp/
│  ├─ src/
│  └─ test/
└─ cli/
   └─ src/

extensions/
└─ agentils-vscode/
   ├─ src/
   └─ templates/

.github/
├─ copilot-instructions.md
├─ instructions/
├─ agents/
├─ prompts/
└─ hooks/

scripts/
docs/agentils/
```

## 指令同步

Codex / GitHub Copilot 的仓库级指令源放在：

- [.hc/instructions](/Users/liuyuxuan/Desktop/Lenovo/agent-gate/.hc/instructions)

生成目标包括：

- [AGENTS.md](/Users/liuyuxuan/Desktop/Lenovo/agent-gate/AGENTS.md)
- [.github/copilot-instructions.md](/Users/liuyuxuan/Desktop/Lenovo/agent-gate/.github/copilot-instructions.md)
- [.github/instructions](/Users/liuyuxuan/Desktop/Lenovo/agent-gate/.github/instructions)

手动同步：

```bash
pnpm run sync:instructions
```

提交前的 `pre-commit` hook 会自动执行一次同步并把生成结果加入暂存区。

## 开发

安装依赖：

```bash
pnpm install
```

类型检查：

```bash
pnpm run typecheck
```

构建：

```bash
pnpm run build
```

运行一个本地 smoke test：

```bash
pnpm run smoke
```

本地直接启动 HTTP stream 调试模式，不需要发布：

```bash
pnpm install
pnpm run dev:http
```

默认地址：

```text
http://127.0.0.1:8788/mcp
```

直接启动 stdio MCP server：

```bash
pnpm start
```

## VS Code 配置

仓库内已经提供本地 MCP 配置文件 [.vscode/mcp.json](/Users/liuyuxuan/Desktop/Lenovo/agent-gate/.vscode/mcp.json)：

```json
{
  "servers": {
    "agentils": {
      "type": "stdio",
      "command": "node",
        "args": ["packages/mcp/dist/index.js"]
      }
    }
  }
```

`.github` 下的 customizations 目前也已经收口到新结构：

- instructions: 全局与模块规则
- prompts: start / resume / verify / handoff
- hooks: approval / post-verify / stop-gate / audit

## CLI 注入

`packages/cli` 提供 `agentils inject` 与 `agentils uninstall`，用于把 AgentILS 的 prompts、instructions 和 MCP 配置注入到不同宿主，或清理这些注入项。

当前首批支持：

- `vscode`
- `cursor`
- `codex`
- `antigravity`

示例：

```bash
pnpm --filter @agentils/cli build
node packages/cli/dist/index.js inject vscode cursor --workspace .
```

## 当前未完成项

- control plane 还没有独立服务化
- state 当前通过 `.data/agentils-state.json` 落盘，还没有独立数据库或远程 store
- verify 逻辑目前是最小可运行版，不是最终规则集
- GitHub 仓库名与包名还未完全统一
