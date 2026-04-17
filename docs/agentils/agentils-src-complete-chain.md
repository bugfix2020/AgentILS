# AgentILS MCP Server 源码完整调用链路分析

版本：v1.0  
来源：`src/` 目录逐文件分析  
日期：2026-04-16  
用途：理解 AgentILS 状态机 MCP Server 的完整实现链路，为拆分方案提供依据

---

## 0. 阅读前提示

本文档按**模块 → 文件 → 函数调用级别**描述 AgentILS MCP Server 的完整实现链路。  
目的是让实现者清楚知道：每个模块做什么、数据如何流动、状态如何转移、网关如何拦截。

---

## 1. 模块架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                     MCP Client (LLM / IDE)                      │
└────────────────────────────┬────────────────────────────────────┘
                             │ JSON-RPC (stdio / HTTP Streamable)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Gateway 层 (协议适配)                        │
│  server.ts → tools.ts → resources.ts → prompts.ts               │
│  context.ts (elicitUser) → shared.ts → transports.ts            │
└────────────────────────────┬────────────────────────────────────┘
                             │ 调用 Orchestrator 方法
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Orchestrator 层 (业务编排)                     │
│  orchestrator.ts (聚合) → conversation-orchestrator.ts           │
│  task-orchestrator.ts → control-mode-orchestrator.ts             │
│  verification-orchestrator.ts                                    │
└────────────────────────────┬────────────────────────────────────┘
                             │ 读写 Store
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Store 层 (状态真值源)                       │
│  memory-store.ts (主存储) → conversation-store.ts (对话投影)     │
│  task-store.ts (任务投影) → summary-store.ts (总结读写)          │
│  audit-store.ts (审计查询) → persistence.ts (JSON 持久化)        │
└─────────────────────────────────────────────────────────────────┘

辅助模块：
  Control: control-modes.ts, gate-evaluators.ts, mode-transitions.ts, override-policy.ts
  Control-Plane: conversation-service.ts, task-service.ts, override-service.ts, summary-service.ts, ui-actions.ts
  Audit: audit-logger.ts
  Budget: budget-checker.ts
  Policy: tool-policy-checker.ts
  Interaction: channel-mcp.ts, channel-hc.ts, interaction-loop.ts, sampling-client.ts
  Summary: summary-schema.ts, summary-loader.ts, summary-writer.ts
  Config: defaults.ts
```

---

## 2. 文件清单与职责

### 2.1 入口

| 文件 | 职责 | 主要导出 |
|------|------|---------|
| `src/index.ts` | 主导出点，重新导出所有公共 API | `createAgentGateServer`, `AgentGateOrchestrator`, `AgentGateMemoryStore` 等 |

### 2.2 Gateway 层

| 文件 | 职责 | 主要导出 |
|------|------|---------|
| `src/gateway/server.ts` | 创建 MCP 服务器实例，注册工具/资源/提示 | `createAgentGateServer()` |
| `src/gateway/gateway.ts` | 重新导出，启动运输层 | `createAgentGateServer`, `startStdioServer`, `startStreamableHttpServer` |
| `src/gateway/context.ts` | 请求作用域上下文，elicitUser 桥接 | `createAgentGateRequestContext()`, `AgentGateRequestContext` |
| `src/gateway/tools.ts` | MCP 工具注册（18+ 工具） | 工具注册函数 |
| `src/gateway/resources.ts` | MCP 资源注册（只读投影） | 资源注册函数 |
| `src/gateway/prompts.ts` | MCP 提示注册 | `agentgate_start_run`, `agentgate_conversation_snapshot` |
| `src/gateway/shared.ts` | 网关共用工具函数 | `textResult()`, `resolveRun()`, `readGatewayRunSnapshot()` |
| `src/gateway/transports.ts` | 运输层启动（stdio/HTTP） | `startStdioServer()`, `startStreamableHttpServer()` |

### 2.3 Orchestrator 层

| 文件 | 职责 | 主要导出 |
|------|------|---------|
| `src/orchestrator/orchestrator.ts` | 主编排器，聚合子编排器 | `AgentGateOrchestrator` 类 |
| `src/orchestrator/conversation-orchestrator.ts` | 对话启动/结束/状态查询 | `AgentGateConversationOrchestrator` |
| `src/orchestrator/task-orchestrator.ts` | 任务卡片更新、步骤转移、模式设置 | `AgentGateTaskOrchestrator` |
| `src/orchestrator/control-mode-orchestrator.ts` | 审批流程、反馈记录、模式转移 | `AgentGateControlModeOrchestrator` |
| `src/orchestrator/verification-orchestrator.ts` | 验证评估、总结生成、任务完成 | `AgentGateVerificationOrchestrator` |
| `src/orchestrator/index.ts` | 重新导出 | - |

### 2.4 Store 层

| 文件 | 职责 | 主要导出 |
|------|------|---------|
| `src/store/memory-store.ts` | **真值源**，内存运行时状态 + 持久化 | `AgentGateMemoryStore` 类 |
| `src/store/conversation-store.ts` | 对话状态读模型 | `AgentGateConversationStore` |
| `src/store/task-store.ts` | 任务视图投影 | `AgentGateTaskStore` |
| `src/store/summary-store.ts` | 任务总结文档读写 | `AgentGateSummaryStore` |
| `src/store/audit-store.ts` | 审计事件查询 | `AgentGateAuditStore` |
| `src/store/persistence.ts` | 加载/保存持久化状态 | `loadPersistentStore()`, `savePersistentStore()` |

### 2.5 Types 层

| 文件 | 职责 | 主要导出 |
|------|------|---------|
| `src/types/task.ts` | 任务/运行/预算/审批类型 | `RunRecord`, `TaskCard`, `HandoffPacket`, `RunStep`, `RunStatus` |
| `src/types/conversation.ts` | 对话状态类型 | `ConversationRecord`, `ConversationState` |
| `src/types/control-mode.ts` | 控制模式、覆盖状态 | `ControlMode`, `OverrideState` |
| `src/types/hook.ts` | Webhook 决策类型 | `HookDecision`, `HookEvent` |

### 2.6 Control 层

| 文件 | 职责 | 主要导出 |
|------|------|---------|
| `src/control/control-modes.ts` | 模式常量、规范化、退化/升级 | `ControlMode`, `degradeControlMode()`, `upgradeControlMode()` |
| `src/control/gate-evaluators.ts` | 网关决策（执行/停止/完成） | `evaluateTaskExecutionGate()`, `evaluateTaskStopGate()` |
| `src/control/mode-transitions.ts` | 模式转移规则、信号处理 | `nextControlMode()`, `ControlModeSignal` |
| `src/control/override-policy.ts` | 覆盖状态管理 | `createOverrideState()`, `isOverrideActive()` |

### 2.7 Control-Plane 层

| 文件 | 职责 | 主要导出 |
|------|------|---------|
| `src/control-plane/conversation-service.ts` | 对话查询/操作接口 | `ConversationService` |
| `src/control-plane/task-service.ts` | 任务查询/操作接口 | `TaskService` |
| `src/control-plane/override-service.ts` | 覆盖状态操作接口 | `OverrideService` |
| `src/control-plane/summary-service.ts` | 总结查询/生成接口 | `SummaryService` |
| `src/control-plane/ui-actions.ts` | UI 命令适配 | `continueTask()`, `acceptOverride()`, `markTaskDone()` 等 |

### 2.8 其他模块

| 文件 | 职责 | 主要导出 |
|------|------|---------|
| `src/audit/audit-logger.ts` | 审计事件日志 | `AgentGateAuditLogger` |
| `src/budget/budget-checker.ts` | 预算检查、预览 | `evaluateBudget()`, `previewBudgetUsage()` |
| `src/policy/tool-policy-checker.ts` | 工具政策评估 | `evaluateToolPolicy()` |
| `src/config/defaults.ts` | 配置默认值 | `defaultConfig` |
| `src/interaction/channel-mcp.ts` | MCP 通道抽象 | `McpInteractionChannel` |
| `src/interaction/channel-hc.ts` | 人工澄清通道 | `HumanClarificationChannel` |
| `src/interaction/interaction-loop.ts` | 交互循环推进 | `advanceInteractionLoop()` |
| `src/interaction/sampling-client.ts` | LLM 采样客户端（存根） | `SamplingClient` |
| `src/summary/summary-schema.ts` | 总结文档模式 | `TaskSummaryDocument`, `TaskSummaryFrontmatter` |
| `src/summary/summary-loader.ts` | 总结文档解析 | `readTaskSummaryDocument()` |
| `src/summary/summary-writer.ts` | 总结文档序列化/写入 | `writeTaskSummaryDocument()` |

---

## 3. Gateway 层详细分析

### 3.1 `server.ts` — MCP 服务器工厂

```
createAgentGateServer(config, dependencies?):
  1. store = dependencies?.store ?? new AgentGateMemoryStore(config)
  2. orchestrator = dependencies?.orchestrator ?? new AgentGateOrchestrator(store, config)
  3. mcpServer = new McpServer({ name: 'agentils', version })
  4. runtime = { server: mcpServer, store, orchestrator, config }
  5. registerGatewayTools(runtime)
  6. registerGatewayResources(runtime)
  7. registerGatewayPrompts(runtime)
  8. return runtime: AgentGateServerRuntime
```

### 3.2 `context.ts` — 请求上下文 + elicitUser

```
createAgentGateRequestContext(runtime, preferredRunId?):
  → {
    runId: resolvedRunId,
    conversationId,
    taskId,
    traceId: uuid(),
    interactionAllowed: true,
    now(): string,
    elicitUser(params): Promise<ElicitationResult>
      └─ runtime.server.server.elicitInput(params)
         └─ JSON-RPC → MCP Client → VSIX/IDE 弹窗
  }
```

**关键设计**：`elicitUser` 是 MCP Server 向客户端发起的**反向请求**。MCP Server 不直接显示 UI，而是通过 JSON-RPC `elicitation/create` 请求让客户端（如 VSIX）显示交互界面。

### 3.3 `tools.ts` — MCP 工具注册（18+ 工具）

完整工具列表和调用链：

| 工具名 | 调用链 | 职能 |
|--------|--------|------|
| `new_task_request` | → `orchestrator.startRun(input)` | 启动新任务 |
| `run_start` | → `orchestrator.startRun(input)` | 兼容：启动运行 |
| `run_get` | → `readGatewayRunSnapshot(store, runId)` | 读取运行快照 |
| `conversation_get` | → `orchestrator.getConversationContext(runId)` | 读取对话上下文 |
| `conversation_end` | → `orchestrator.endConversation(runId)` | 结束对话 |
| `control_mode_get` | → `store.getCurrentControlMode(runId)` | 读取控制模式 |
| `task_summary_get` | → `store.getTaskSummary(runId)` | 读取任务总结 |
| `taskcard_get` | → `store.requireTaskCard(runId)` | 读取任务卡片 |
| `taskcard_put` | → `orchestrator.upsertTaskCard(taskCard)` | 更新任务卡片 |
| `handoff_get` | → `store.requireHandoff(runId)` | 读取交接包 |
| `handoff_put` | → `orchestrator.upsertHandoff(handoff)` | 更新交接包 |
| `budget_check` | → `orchestrator.checkBudget(runId)` | 预算检查 |
| `policy_check` | → `orchestrator.evaluatePolicy(toolName, runId)` | 政策检查 |
| `approval_begin` | → `orchestrator.beginApprovalRequest(ctx, input)` | 启动审批流 |
| `approval_record` | → `orchestrator.recordApproval(runId, summary, result)` | 记录审批决策 |
| `feedback_record` | → `orchestrator.recordFeedback(runId, feedback)` | 记录反馈 |
| `verify` | → `orchestrator.verifyRun(runId, userConfirmedDone, ctx)` | 验证任务 |
| `audit_append` | → `store.appendAuditEvent(runId, event)` | 追加审计事件 |

**通用调用链模式**：
```
Tool Handler(input):
  1. ctx = createToolRequestContext(runtime, input.preferredRunId)
  2. { runId, run } = resolveRun(store, ctx.runId)
  3. result = orchestrator.method(runId, ...)
  4. return textResult('label', result)
```

### 3.4 `resources.ts` — MCP 资源注册

| 资源 URI | 数据源 | 说明 |
|----------|--------|------|
| `run-snapshot://current` | `buildRunSnapshotResourcePayload()` | 当前运行统一快照 |
| `run-snapshot://{runId}` | 同上 | 指定运行快照 |
| `conversation://current` | `conversationStore.getRecord()` | 对话状态 |
| `task-summary://{runId}` | `summaryStore.readSummary()` | 任务总结 |
| `control-mode://{runId}` | `store.getCurrentControlMode()` | 控制模式 |

**统一快照构建**：
```
buildRunSnapshotResourcePayload(runtime, preferredRunId):
  snapshot = readGatewayRunSnapshot(store, preferredRunId)
    ├── resolveRun()
    ├── getCurrentOverrideState()
    ├── getTaskRecord()
    ├── getTaskSummary()
    ├── readTaskSummary()
    └── conversationStore.summarizeNextAction()
  → asJson(buildActiveTaskSnapshot(snapshot))
```

### 3.5 `shared.ts` — 网关共用工具

```
textResult(label, value, isError?):
  → { content: [{ type: 'text', text: `[${label}] ${JSON.stringify(value)}` }], isError }

resolveRun(store, preferredRunId?):
  → store.resolveRunId(preferredRunId)
  → { runId, run: RunRecord }

readGatewayRunSnapshot(store, preferredRunId?):
  → 聚合: run + taskCard + handoff + taskSummary + overrideState + nextAction
  → GatewayRunSnapshot
```

### 3.6 `transports.ts` — 运输层

```
startStdioServer(runtime):
  transport = new StdioServerTransport()
  runtime.server.connect(transport)
  → 进程生命周期管理（SIGINT graceful shutdown）

startStreamableHttpServer(runtime, port):
  Express app → /mcp 端点
  → 每个会话创建新 transport
  → HTTP 模式为每个客户端创建新 store + orchestrator 实例（会话隔离）
```

**关键设计差异**：
- **Stdio 模式**：共享全局 store + orchestrator 实例，适合单客户端
- **HTTP 模式**：每会话独立实例，适合多客户端

---

## 4. Orchestrator 层详细分析

### 4.1 `orchestrator.ts` — 主编排器

```
class AgentGateOrchestrator {
  conversation: AgentGateConversationOrchestrator
  task: AgentGateTaskOrchestrator
  controlMode: AgentGateControlModeOrchestrator
  verification: AgentGateVerificationOrchestrator
  audit: AgentGateAuditLogger

  // 公共接口（委托到子编排器）
  startRun(input) → conversation.startRun(input)
  checkBudget() → evaluateBudget()
  evaluatePolicy() → evaluateToolPolicy()
  upsertTaskCard(tc) → task.upsertTaskCard(tc)
  beginApprovalRequest(ctx, input) → controlMode.beginApprovalRequest(ctx, input)
  recordApproval(runId, summary, result) → controlMode.recordApproval(...)
  recordFeedback(runId, feedback) → controlMode.recordFeedback(...)
  verifyRun(runId, confirmed, ctx) → verification.verifyRun(...)
}
```

### 4.2 `conversation-orchestrator.ts`

```
class AgentGateConversationOrchestrator {
  startRun(input: StartRunInput):
    1. conversationId = resolveConversationId(input.conversationId)
    2. run = store.startRun(input) → RunRecord
    3. ensureSummaryDocumentPath(run.runId)
    4. setTaskControlMode(run.runId, input.controlMode ?? 'normal')
    5. audit.info(run.runId, 'conversation.start', ...)
    6. return run

  getConversationContext(preferredRunId?):
    1. resolve runId
    2. conversationStore.getRecord(runId)
    3. return ConversationRecord

  endConversation(runId):
    1. 检查无活跃任务
    2. store.updateRun(runId, { conversation: { completed: true } })
    3. audit.info(runId, 'conversation.end', ...)
}
```

### 4.3 `task-orchestrator.ts`

```
class AgentGateTaskOrchestrator {
  upsertTaskCard(taskCard: TaskCard):
    1. normalizeControlMode(taskCard.controlMode)
    2. 如果 currentStep == 'execute' && controlMode != 'direct':
         evaluateTaskExecutionGate(run, taskCard, overrideState)
         如果失败: revert to 'confirm_elements', throw GateViolationError
    3. store.upsertTaskCard(taskCard)
    4. appendRunEvent('task.card.updated')

  setTaskControlMode(runId, mode):
    1. validated = normalizeControlMode(mode)
    2. store.updateRun(runId, { controlMode: validated })
    3. appendRunEvent('task.control_mode.updated')

  ensureSummaryDocumentPath(runId):
    1. 如果 run.summaryDocumentPath 为空:
       path = `.data/agentils-summaries/${taskId}/task-summary.md`
       store.updateRun(runId, { summaryDocumentPath: path })
}
```

### 4.4 `control-mode-orchestrator.ts`

```
class AgentGateControlModeOrchestrator {
  beginApprovalRequest(ctx, input):
    1. 验证 ctx.runId == input.runId
    2. activeApproval = { approved: false, action: 'cancel', summary: input.summary }
    3. store.transitionRun(runId, 'approval', 'awaiting_approval')
    4. appendRunEvent('approval.pending')
    5. return run

  recordApproval(runId, summary, result: ApprovalResult):
    根据 result.action:
    ├─ 'decline':
    │    store.transitionRun(runId, 'cancelled', 'cancelled')
    ├─ 'cancel':
    │    store.transitionRun(runId, 'approval', 'awaiting_approval')
    ├─ 'accept':
    │    activeApproval.approved = true
    │    createOverrideState() → overrideState
    │    store.transitionRun(runId, 'execute', 'active')
    │    如果 result.payload?.status == 'revise':
    │      store.transitionRun(runId, 'confirm_elements', 'active')
    │    如果 result.payload?.status == 'done':
    │      store.transitionRun(runId, 'verify', 'active')
    │      store.updateRun(runId, { userConfirmedDone: true })
    appendRunEvent('approval.recorded')

  applyControlModeSignal(runId, signal: ControlModeSignal):
    newMode = nextControlMode(currentMode, signal)
    如果 newMode != currentMode:
      store.updateRun(runId, { controlMode: newMode })
      appendRunEvent('task.control_mode.transition')
}
```

### 4.5 `verification-orchestrator.ts`

```
class AgentGateVerificationOrchestrator {
  verifyRun(runId, userConfirmedDone, ctx):
    1. checks = evaluateVerification(run, taskCard, handoff):
       ├─ goal 非空
       ├─ steps 有至少一个完成步骤
       ├─ handoff.nextRecommendedAction 非空
       ├─ completedSteps 或 pendingSteps 非空
       └─ userConfirmedDone == true
    
    2. verdict 判定:
       ├─ 全部通过 → 'pass'
       ├─ 有风险但通过 → 'pass_with_risks'
       ├─ 检查失败 → 'blocked' | 'failed'
    
    3. 如果 verdict == 'pass' && userConfirmedDone:
       writeTaskSummary(run, taskCard, handoff)
       store.transitionRun(runId, 'done', 'completed')
       appendRunEvent('verify.complete')
    
    4. 否则:
       rollbackStep = resolveRollback(run)
       store.transitionRun(runId, rollbackStep, rollbackStatus)
       appendRunEvent('verify.rollback')
    
    5. return { verdict, reasons, verificationStatus, rollbackStep }
}
```

---

## 5. Store 层详细分析

### 5.1 `memory-store.ts` — 真值源

```
class AgentGateMemoryStore {
  // 核心数据结构
  private runs: Map<string, RunRecord>
  private taskCards: Map<string, TaskCard>
  private handoffs: Map<string, HandoffPacket>
  private auditEvents: Map<string, AuditEvent[]>
  private runEvents: Map<string, RunEvent[]>
  private meta: { lastRunId: string | null, updatedAt: string }

  // 子 store（投影层）
  conversationStore: AgentGateConversationStore
  taskStore: AgentGateTaskStore
  summaryStore: AgentGateSummaryStore
  auditStore: AgentGateAuditStore

  // 写操作
  startRun(input) → RunRecord
  updateRun(runId, updates) → RunRecord
  transitionRun(runId, step, status) → RunRecord
  upsertTaskCard(taskCard) → TaskCard（同步更新 handoff）
  upsertHandoff(handoff) → HandoffPacket
  appendRunEvent(runId, event) → void
  appendAuditEvent(runId, event) → void
  markLastRun(runId) → void
  persist() → 写入 .data/agentils-state.json

  // 读操作
  resolveRunId(preferredRunId?) → string | null
  requireRun(runId) → RunRecord（非空保证）
  requireTaskCard(runId) → TaskCard
  requireHandoff(runId) → HandoffPacket
  getCurrentOverrideState(runId) → OverrideState | null
  listRuns() → RunRecord[]
}
```

**持久化格式**：
```json
{
  "meta": { "lastRunId": "run-xxx", "updatedAt": "2026-04-16T..." },
  "runs": [/* RunRecord[] */],
  "taskCards": [/* TaskCard[] */],
  "handoffs": [/* HandoffPacket[] */],
  "auditEvents": [/* AuditEvent[][] */],
  "runEvents": [/* RunEvent[][] */]
}
```

### 5.2 `conversation-store.ts` — 对话状态读模型

```
class AgentGateConversationStore {
  getRecord(preferredRunId?) → ConversationRecord:
    1. listRuns() → 过滤同一 conversationId
    2. 统计已完成任务
    3. deriveConversationState(run) → 推导状态
    4. 构建聚合记录

  deriveConversationState(run) → ConversationState:
    ├─ run == null → 'await_next_task'
    ├─ run.conversation.completed → 'conversation_done'
    ├─ run.currentStatus ∈ {awaiting_user, awaiting_approval, budget_exceeded, failed}
    │    → 'conversation_blocked'
    ├─ run.currentStatus ∈ {completed, cancelled} → 'await_next_task'
    └─ else → 'active_task'

  summarizeNextAction(run, overrideState) → string:
    → `${mode} / ${overrideSuffix} / next: ${run.currentStep}`
}
```

---

## 6. 状态机详解

### 6.1 Task Phase 转移（RunStep）

```
collect                          ← 初始阶段，收集需求
  ↓
confirm_elements                 ← 确认信息，用户核实
  ↓
plan                            ← 制定执行计划
  ↓
approval                        ← 审批流程（高风险操作）
  ↓ (accept)
execute                         ← 真正执行代码/操作
  ↓
handoff_prepare                 ← 准备交接包
  ↓
verify                          ← 验证结果
  ↓ (pass + userConfirmedDone)
done ✓                          ← 任务完成

异常路径：
  任何阶段 → blocked            ← 预算耗尽/策略拦截
  任何阶段 → cancelled           ← 用户取消/审批拒绝
  任何阶段 → failed              ← 执行失败
  
回滚路径：
  approval (decline) → cancelled
  approval (revise) → confirm_elements
  verify (failed) → 前一步骤（由 resolveRollback 决定）
```

### 6.2 Task Status 映射

| Status | 含义 | 触发条件 |
|--------|------|---------|
| `active` | 正在执行 | 正常推进 |
| `awaiting_user` | 等待用户输入 | 需要澄清/确认 |
| `awaiting_approval` | 等待审批 | beginApprovalRequest |
| `budget_exceeded` | 预算耗尽 | evaluateBudget 失败 |
| `completed` | 任务完成 | verifyRun(pass) |
| `cancelled` | 任务取消 | approval decline |
| `failed` | 任务失败 | 执行异常 |

### 6.3 Gate 拦截规则

**evaluateTaskExecutionGate(run, taskCard, overrideState)**：
```
可执行 IFF:
  1. technicallyReady:
     - goal 非空
     - steps 有至少一个步骤
     - verificationRequirements 非空
  2. boundaryApproved:
     - scope 非空 OR override.confirmed == true
  3. policyAllowed:
     - evaluateToolPolicy() → decision.allowed == true
  4. controlMode 影响:
     - 'normal': 全部检查
     - 'alternate': 略宽松
     - 'direct': 跳过部分检查
```

**evaluateTaskStopGate(run)**：
```
可停止 IFF:
  1. userConfirmedDone == true
  2. verifyPassed == true
```

### 6.4 控制模式状态机

```
normal  ←→  alternate  ←→  direct
  ↑           ↑              ↑
  └───────────┴──────────────┘
  recovery signal (升级回正常)

信号处理 (nextControlMode):
  signal = 'stable'          → 保持当前模式
  signal = 'override'        → 退化一级（normal → alternate → direct）
  signal = 'repeat_override' → 重复覆盖 count > 1 时直接退化到 direct
  signal = 'recovery'        → 升级一级（direct → alternate → normal）
```

### 6.5 审批流程

```
正常执行中 → 发现需要审批
  ↓
beginApprovalRequest(ctx, input)
  → activeApproval = { approved: false }
  → status: 'awaiting_approval'
  ↓
等待用户决策（通过 elicitUser 或直接调用）
  ↓
recordApproval(runId, summary, result)
  ├── result.action == 'accept'
  │     → activeApproval.approved = true
  │     → createOverrideState()
  │     → status: 'active'（继续执行）
  ├── result.action == 'decline'
  │     → status: 'cancelled'
  └── result.action == 'cancel'
       → status: 'awaiting_approval'（重新审批）
```

---

## 7. 数据流图

### 7.1 写入路径

```
Tool Call Input (JSON)
  ↓ Zod Validation
Orchestrator.method()
  │
  ├─ Read: store.require*()
  ├─ Compute: evaluate gates / derive state
  ├─ Write: store.update / upsert / transition
  ├─ Event: appendRunEvent() + appendAuditEvent()
  └─ Persist: persist() → .data/agentils-state.json
```

### 7.2 读取路径

```
Resource Request / Tool Read
  ↓
buildRunSnapshotResourcePayload()
  ├─ readGatewayRunSnapshot()
  │  ├─ store.requireRun()
  │  ├─ store.requireTaskCard()
  │  ├─ store.requireHandoff()
  │  ├─ store.getCurrentOverrideState()
  │  ├─ taskStore.getTaskRecord()
  │  ├─ summaryStore.readSummary()
  │  └─ conversationStore.summarizeNextAction()
  └─ buildActiveTaskSnapshot()
  ↓
MCP JSON Response
```

### 7.3 总结写入路径

```
verification.verifyRun() (verdict=pass && userConfirmedDone)
  ↓
summaryStore.writeSummary(SummaryWriteInput)
  ├─ 构建 Frontmatter (YAML-like: taskId, title, goal, status, controlMode, ...)
  ├─ 构建 Body (Markdown: steps, risks, decisions, verification, ...)
  ├─ 序列化为 .md 文件
  └─ mkdirSync() + writeFileSync()
  ↓
.data/agentils-summaries/{taskId}/task-summary.md
```

---

## 8. Control-Plane 层

Control-Plane 是为 **UI 和外部 API** 提供的高层操作接口，封装了 orchestrator 调用：

### 8.1 `ui-actions.ts`

```
continueTask(runtime, input?)
  → store.transitionRun(runId, nextStep, 'active')

acceptOverride(runtime, input)
  → orchestrator.recordApproval(runId, summary, { action: 'accept', payload: input })

markTaskDone(runtime, input?)
  → orchestrator.verifyRun(runId, true, ctx)

endConversation(runtime, input?)
  → orchestrator.endConversation(runId)
```

**关键设计**：Control-Plane 层是 VSIX `task-service-client.ts` 的对接点。VSIX 通过 HTTP 或 fork 调用 control-plane 方法。

---

## 9. Audit 链路

```
任何操作
  ↓
orchestrator.audit.info/warn/error(runId, action, message, details)
  ↓
store.appendAuditEvent(runId, { level, action, message, details, timestamp })
  → Map<runId, AuditEvent[]>
  ↓
持久化到 .data/agentils-state.json

查询：
auditStore.summarize(runId) → { auditEvents[], runEvents[] }
```

**Audit Action 示例**：
- `conversation.start` / `conversation.end`
- `task.control_mode.updated`
- `approval.pending` / `approval.recorded`
- `verify.rollback` / `verify.complete`
- `budget.exceeded` / `policy.check`

---

## 10. 类型合同

### 10.1 StartRunInput

```typescript
{
  title: string
  goal: string
  scope?: string[]
  constraints?: string[]
  risks?: string[]
  verificationRequirements?: string[]
  mode?: ConversationMode
  controlMode?: ControlMode          // 默认 'normal'
  conversationId?: string | null
  summaryDocumentPath?: string | null
  openQuestions?: string[]
  assumptions?: string[]
  decisionNeededFromUser?: string[]
  executionReadiness?: {
    technicallyReady?: boolean
    boundaryApproved?: boolean
    policyAllowed?: boolean
    missingInfo?: string[]
    risks?: string[]
  }
}
```

### 10.2 ApprovalResult

```typescript
{
  action: 'accept' | 'decline' | 'cancel'
  payload?: {
    status: 'continue' | 'done' | 'revise'
    msg?: string
  }
}
```

### 10.3 VerifyRunResult

```typescript
{
  verdict: 'pass' | 'pass_with_risks' | 'blocked' | 'failed'
  reasons: string[]
  verificationStatus: {
    resultVerified: boolean
    handoffVerified: boolean
    verdict?: VerifyVerdict
  }
  rollbackStep?: RunStep
  rollbackStatus?: RunStatus
}
```

### 10.4 GatewayRunSnapshot

```typescript
{
  run: RunRecord
  taskCard: TaskCard
  handoff: HandoffPacket
  overrideState: OverrideState | null
  taskSummary: TaskSummaryDocument | null
  nextAction: string
}
```

---

## 11. 设计洞察与问题

### 11.1 架构亮点

1. **单向数据流**：Orchestrator → Store 的严格单向流，无逆向更新
2. **统一快照模式**：`GatewayRunSnapshot` 聚合多源数据为统一读模型
3. **控制模式显式化**：`ControlMode` + `ControlModeSignal` 清晰表达转移规则
4. **类型合同优先**：Zod 模式确保数据完整性
5. **事件溯源基础**：`runEvents` + `auditEvents` 为审计和重播提供基础
6. **门禁评估分离**：`gate-evaluators.ts` 独立于编排逻辑，易于测试

### 11.2 潜在问题

| 问题 | 现状 | 影响 | 建议 |
|------|------|------|------|
| **并发控制** | 无锁机制，纯内存状态 | 多进程场景数据竞争 | 需分布式锁或 event sourcing |
| **Handoff 同步** | `upsertTaskCard()` 自动同步 handoff | 易不一致 | 需显式验证或原子操作 |
| **State Persistence** | 同步 JSON 写入 | 大状态文件性能问题 | 考虑增量持久化 |
| **错误处理** | 大多数方法不捕获异常 | Tool handler 异常导致 MCP 挂起 | 统一异常处理 |
| **恢复机制** | 无故障恢复/重试 | 长运行任务中断后无法恢复 | 需 checkpoint + 重试机制 |
| **HTTP 会话隔离** | 每会话独立 store | 多客户端间状态不共享 | 需共享 store 或外部数据库 |

### 11.3 与 VSIX 的关键接口

MCP Server 与 VSIX 通过以下机制对接：

1. **正向**：VSIX 的 LM Tool → MCP tool call → Gateway → Orchestrator
2. **反向**：Orchestrator 需要用户交互 → `elicitUser()` → JSON-RPC `elicitation/create` → VSIX 弹 WebView
3. **Control-Plane**：VSIX 的 `task-service-client.ts` → HTTP/fork → `control-plane/ui-actions.ts`

这三条通道是后续拆分时的关键边界。
