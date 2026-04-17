# AgentILS Codex Instructions
# AgentILS Codex 指令

Read this file first.  
请先阅读本文件。

Before reading the repository broadly, read [.hc/codex-modular-debug.md](/Users/liuyuxuan/Desktop/Lenovo/agent-gate/.hc/codex-modular-debug.md).  
在大范围读取仓库之前，先阅读 [.hc/codex-modular-debug.md](/Users/liuyuxuan/Desktop/Lenovo/agent-gate/.hc/codex-modular-debug.md)。

## Scope
## 适用范围

This repository is a pnpm + turbo monorepo. The MCP runtime lives under `packages/mcp`, the VS Code extension lives under `extensions/agentils-vscode`, and the injection CLI lives under `packages/cli`.  
本仓库是一个 pnpm + turbo monorepo。MCP runtime 在 `packages/mcp`，VS Code 扩展在 `extensions/agentils-vscode`，注入 CLI 在 `packages/cli`。

Do not start with full-repo scanning.  
不要一开始就全仓扫描。

Work by active call chain and module boundary.  
请按当前调用链和模块边界工作。

You must follow a React-like one-way data flow rule.  
你必须遵守类似 React 的单向数据流规则。

Commands may enter from multiple gateways, but derived state must have one truth source and flow outward from that source.  
命令可以从多个入口进入，但派生状态必须只有一个真值源，并从该真值源向外投影。

Use a test-first workflow.  
采用测试先行的开发流程。

Define structure and contracts before implementation.  
先定义结构和输入输出合同，再开始实现。

## Module Split
## 模块拆分

### Gateway
### Gateway 层

- `packages/mcp/src/gateway/server.ts`
  Creates the runtime and registers tools, prompts, and resources.  
  创建 runtime，并注册 tools、prompts、resources。
- `packages/mcp/src/gateway/context.ts`
  Defines runtime context and request-scoped context such as `elicitUser`.  
  定义 runtime context 和 request-scoped context，例如 `elicitUser`。
- `packages/mcp/src/gateway/tools.ts`
  Main MCP tool entrypoints. This is the first stop for task start, approval, feedback, verify, and conversation end.  
  MCP tool 主入口。task start、approval、feedback、verify、conversation end 都应优先从这里开始读。
- `packages/mcp/src/gateway/resources.ts`
  Read-only projections for conversation, task summary, control mode, taskcard, handoff, and runlog.  
  conversation、task summary、control mode、taskcard、handoff、runlog 的只读投影层。

### Orchestrator
### Orchestrator 层

- `packages/mcp/src/orchestrator/orchestrator.ts`
  Aggregates sub-orchestrators.  
  聚合各个子 orchestrator。
- `packages/mcp/src/orchestrator/conversation-orchestrator.ts`
  Owns conversation start, read model, and end flow.  
  负责 conversation start、conversation read model、conversation end。
- `packages/mcp/src/orchestrator/task-orchestrator.ts`
  Owns task-level updates such as taskCard, handoff, control mode, and summary path.  
  负责 taskCard、handoff、control mode、summary path 等 task 级更新。
- `packages/mcp/src/orchestrator/control-mode-orchestrator.ts`
  Owns approval, feedback, override, and control mode transitions.  
  负责 approval、feedback、override、control mode 状态推进。
- `packages/mcp/src/orchestrator/verification-orchestrator.ts`
  Owns verify, rollback, and summary writing.  
  负责 verify、rollback、summary 写入。

### Store
### Store 层

- `packages/mcp/src/store/memory-store.ts`
  Runtime state source for runs, taskCards, handoffs, audit events, and run events.  
  runs、taskCards、handoffs、audit events、run events 的 runtime 状态源。
- `packages/mcp/src/store/conversation-store.ts`
  Preferred conversation-state truth source.  
  conversation state 的优先真值源。
- `packages/mcp/src/store/task-store.ts`
  Task read projection layer.  
  task 读取投影层。
- `packages/mcp/src/store/summary-store.ts`
  Task summary read/write layer.  
  task summary 读写层。

### Types
### 类型层

- `packages/mcp/src/types/task.ts`
  Main contracts for `StartRunInput`, `TaskCard`, `RunRecord`, `HandoffPacket`, `ApprovalResult`, `FeedbackDecision`.  
  `StartRunInput`、`TaskCard`、`RunRecord`、`HandoffPacket`、`ApprovalResult`、`FeedbackDecision` 的主合同定义。
- `packages/mcp/src/types/conversation.ts`
  `ConversationRecord` and `ConversationState`.  
  `ConversationRecord` 与 `ConversationState` 定义。
- `packages/mcp/src/types/control-mode.ts`
  `ControlMode` and `OverrideState`.  
  `ControlMode` 与 `OverrideState` 定义。
- `packages/mcp/src/summary/summary-schema.ts`
  `TaskSummaryDocument` contract.  
  `TaskSummaryDocument` 合同定义。

### Tests
### 测试

- `packages/mcp/test/gateway/request-context.test.ts`
  Current unit tests for the request-scoped context chain.  
  当前 request-scoped context 链路的单元测试。

## Read Order
## 读取顺序

If the issue is about:  
如果问题属于：

- task start: read `packages/mcp/src/gateway/tools.ts` -> `packages/mcp/src/orchestrator/conversation-orchestrator.ts` -> `packages/mcp/src/store/memory-store.ts`  
  task start：先读 `packages/mcp/src/gateway/tools.ts` -> `packages/mcp/src/orchestrator/conversation-orchestrator.ts` -> `packages/mcp/src/store/memory-store.ts`
- approval or feedback: read `packages/mcp/src/gateway/tools.ts` -> `packages/mcp/src/gateway/context.ts` -> `packages/mcp/src/orchestrator/control-mode-orchestrator.ts`  
  approval 或 feedback：先读 `packages/mcp/src/gateway/tools.ts` -> `packages/mcp/src/gateway/context.ts` -> `packages/mcp/src/orchestrator/control-mode-orchestrator.ts`
- verify or summary: read `packages/mcp/src/orchestrator/verification-orchestrator.ts` -> `packages/mcp/src/store/summary-store.ts`  
  verify 或 summary：先读 `packages/mcp/src/orchestrator/verification-orchestrator.ts` -> `packages/mcp/src/store/summary-store.ts`
- conversation state: read `packages/mcp/src/store/conversation-store.ts` first  
  conversation state：优先先读 `packages/mcp/src/store/conversation-store.ts`

## Rules
## 规则

- Do not expand context beyond the active chain unless necessary.  
  除非必要，不要把上下文扩大到当前活动链路之外。
- Check upstream output and downstream input before proposing a fix.  
  提出修复前，先检查上游输出和下游输入是否对得上。
- Prefer the type contract over inferred behavior.  
  优先相信类型合同，不要优先猜测运行行为。
- Never violate one-way data flow by recomputing core state across multiple modules.  
  禁止违反单向数据流原则，禁止在多个模块里重复计算核心状态。
- Prefer test-first development.  
  优先采用测试先行的开发方式。
- Define module boundaries and I/O contracts before writing implementation.  
  在写实现前，先定义模块边界和输入输出合同。
- For conversation state, trust `packages/mcp/src/store/conversation-store.ts` before other projections.  
  对于 conversation state，优先以 `packages/mcp/src/store/conversation-store.ts` 为准，而不是其他投影层。
- For request-scoped interaction, trust `packages/mcp/src/gateway/context.ts` and related gateway tests.  
  对于 request-scoped interaction，优先以 `packages/mcp/src/gateway/context.ts` 和相关 gateway 测试为准。

## Detailed Map
## 详细地图

The detailed module map, I/O contracts, and debugging prompts live in:  
详细模块地图、I/O 合同和调试提示词放在：

- [.hc/codex-modular-debug.md](/Users/liuyuxuan/Desktop/Lenovo/agent-gate/.hc/codex-modular-debug.md)

Use that file when you need exact chain-level input/output tracing such as:  
当你需要精确的链路级输入输出追踪时，使用该文件，例如：

- `[module A] -> [module B]`
- required input fields  
  必需输入字段
- produced output fields  
  产出字段
- next file to open  
  下一步应打开的文件
