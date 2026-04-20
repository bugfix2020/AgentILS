# packages/mcp 开发规则

本文件定义 `packages/mcp` 的开发边界、模块职责、调用链路和约束。

## 核心定位

`packages/mcp` 是 AgentILS 的**唯一状态机真值源**和**业务逻辑控制平面**。它完全独立于 IDE，可被不同 IDE（VS Code、Cursor、Codex、Antigravity）共用。

**禁止事项**：
- 禁止引入任何 IDE 特定的 API（如 `vscode.*`）
- 禁止在此包内处理 UI 渲染或交互展示逻辑
- 禁止在多个模块中重复计算核心状态（违反单向数据流）
- 禁止用自然语言摘要替代 `taskSummaryDocument` 或 `handoffPacket` 结构化状态

## 模块职责

### Gateway 层（协议入口）

| 文件 | 职责 | 关键方法 |
|------|------|----------|
| `src/gateway/server.ts` | 创建 MCP runtime，注册 tools/prompts/resources | `createAgentGateServer()` |
| `src/gateway/context.ts` | 定义 runtime context 和 request-scoped context | `createAgentGateRequestContext()`, `ctx.elicitUser()` |
| `src/gateway/tools.ts` | MCP tool 主入口（task start, approval, feedback, verify, session 等） | `registerTaskLifecycleTools()`, `registerInteractionTools()`, `registerSessionTools()`, `registerUiTools()` |
| `src/gateway/resources.ts` | 只读投影（conversation, task summary, control mode, taskcard, handoff, runlog） | 各 resource 注册 |
| `src/gateway/shared.ts` | 共享工具方法（run 解析、snapshot 构建、文本结果格式化） | `resolveRun()`, `resolveRunId()`, `textResult()`, `readGatewayRunSnapshot()` |

**Gateway 边界规则**：
- Gateway 只负责：解析输入 → 创建 request context → 调用 `ctx.elicitUser()` → 委托给 orchestrator
- Gateway **禁止**直接执行领域写操作（如 run 状态转移、decision 追加、override 更新、control-mode 转换）

### Orchestrator 层（业务逻辑聚合）

| 文件 | 职责 | 关键方法 |
|------|------|----------|
| `src/orchestrator/orchestrator.ts` | 聚合四个子 orchestrator | `startRun()`, `checkBudget()`, `evaluatePolicy()`, `verifyRun()` |
| `src/orchestrator/conversation-orchestrator.ts` | conversation start/read/end | `startRun()`, `endConversation()` |
| `src/orchestrator/task-orchestrator.ts` | taskCard, handoff, control mode, summary path | `upsertTaskCard()`, `upsertHandoff()`, `advancePhase()` |
| `src/orchestrator/control-mode-orchestrator.ts` | approval, feedback, override, control-mode 状态推进 | `beginApprovalRequest()`, `recordApproval()`, `recordFeedback()`, `applyOverride()` |
| `src/orchestrator/verification-orchestrator.ts` | verify, rollback, summary 写入 | `verifyRun()`, `writeSummary()` |

### Store 层（状态管理）

| 文件 | 职责 | 真值源 |
|------|------|--------|
| `src/store/memory-store.ts` | runs, taskCards, handoffs, sessions, audit events, run events 的 runtime 状态 | ✅ 主真值源 |
| `src/store/conversation-store.ts` | conversation state 的优先真值源 | ✅ conversation 首选 |
| `src/store/task-store.ts` | task 读取投影层 | 投影层 |
| `src/store/summary-store.ts` | task summary 读写层 | 投影层 |
| `src/store/audit-store.ts` | audit event 管理 | 投影层 |
| `src/store/persistence.ts` | 持久化到文件系统 | 持久化适配 |

**数据流方向**：
```
Gateway (输入解析) → Orchestrator (业务逻辑) → Store (状态写入) → 持久化
Store (状态读取) ← Gateway Resources (只读投影) ← 外部 MCP Client
```

### Types 层（类型合同）

| 文件 | 定义内容 |
|------|----------|
| `src/types/task.ts` | `StartRunInput`, `TaskCard`, `RunRecord`, `HandoffPacket`, `ApprovalResult`, `FeedbackDecision` |
| `src/types/conversation.ts` | `ConversationRecord`, `ConversationState` |
| `src/types/control-mode.ts` | `ControlMode`, `OverrideState` |
| `src/summary/summary-schema.ts` | `TaskSummaryDocument` |

## 核心调用链路

### 链路 1：Task Start

```
tools.ts: new_task_request
  → orchestrator.startRun(input)
    → conversation-orchestrator.startRun(input)
      → memory-store.startRun(input)  // 创建 RunRecord, TaskCard, HandoffPacket
      → audit-store.append('run.start')
    → return RunRecord
```

### 链路 2：Approval Request

```
tools.ts: approval_request
  → createToolRequestContext(runtime, runId)  // 创建 request context
  → resolveOrCreateSession(runtime, runId)    // 确保 session 存在
  → orchestrator.beginApprovalRequest(ctx, input)
    → control-mode-orchestrator.beginApprovalRequest()
  → store.openSessionInteraction()            // 写入 session pending interaction
  → ctx.elicitUser({ mode: 'approval', ... }) // 向 MCP client 发起 elicitation
  → 等待 client 回复 (accept/decline/cancel)
  → orchestrator.recordApproval()
    → control-mode-orchestrator.recordApproval()
  → store.resolveSessionInteraction()         // 解决 session pending interaction
```

### 链路 3：Feedback Gate

```
tools.ts: feedback_gate
  → createToolRequestContext(runtime, runId)
  → resolveOrCreateSession(runtime, runId)
  → store.openSessionInteraction()
  → ctx.elicitUser({ mode: 'feedback', ... })
  → 等待 client 回复 (continue/done/revise)
  → orchestrator.recordFeedback()
  → store.resolveSessionInteraction()
```

### 链路 4：Verify Run

```
tools.ts: verify_run
  → orchestrator.verifyRun(runId, userConfirmedDone, ctx)
    → verification-orchestrator.verifyRun()
      → 检查 handoff 完整性
      → 检查 result 状态
      → 如果通过 → writeSummary()
      → 返回 VerifyRunResult
```

### 链路 5：Session 消息管理

```
tools.ts: ui_session_append_user_message
  → store.appendSessionMessage(sessionId, message, queueUserMessage: true)
  → 消息写入 session transcript，messageId 加入 queuedUserMessageIds

tools.ts: ui_session_consume_user_message
  → store.consumeSessionUserMessage(sessionId, messageId)
  → 从 queuedUserMessageIds 移除已处理的消息
```

## `ctx.elicitUser()` 工作原理

```typescript
// context.ts
async elicitUser(params: AgentGateElicitParams): Promise<AgentGateElicitResult> {
  if (!interactionAllowed) {
    throw new Error('User interaction is not allowed.')
  }
  // 通过 MCP SDK 的 elicitInput() 向 client 发送 elicitation/create 请求
  // 超时设为 2_147_483_647ms（~24天），因为人类交互可能长时间等待
  return runtime.server.server.elicitInput(params, {
    timeout: AGENTILS_INTERACTION_TIMEOUT_MSEC,
  })
}
```

**关键约束**：
- `elicitUser()` 依赖 MCP 协议的 `elicitation/create`，不依赖任何 IDE API
- 如果没有 MCP client 连接，或 client 未声明 `elicitation` capability，调用会失败或挂起
- 当前产品实现中，只有 VS Code Extension 是已实现的 elicitation 承接者
- 协议层面支持任何声明了 elicitation capability 的 MCP client

## Session 状态模型

```typescript
interface AgentILSSessionState {
  sessionId: string
  status: 'active' | 'finished'
  conversationId: string
  runId: string | null
  messages: AgentILSSessionMessage[]           // transcript（消息列表）
  queuedUserMessageIds: string[]               // 待处理的用户消息 ID
  pendingInteraction: AgentILSSessionPendingInteraction | null  // 当前挂起的交互
  createdAt: string
  updatedAt: string
}
```

**Session 解析规则**（`resolveSessionId()`）：
- 优先使用 `preferredSessionId`
- 其次根据 `preferredRunId` 查找关联的最新 session
- 不复用 `lastSessionId`（避免旧 pending interaction 泄漏）
- 找不到时返回 null，强制创建新 session

## 开发工作流

1. **读取顺序**：按问题分类查阅（参见 AGENTS.md 的 Read Order）
2. **测试先行**：先定义 I/O 合同和测试用例，再写实现
3. **类型合同优先**：相信类型定义，不猜测运行行为
4. **上下游对齐**：修改前检查上游输出和下游输入是否匹配
5. **持久化**：所有状态变更通过 `this.persist()` 写入文件系统
