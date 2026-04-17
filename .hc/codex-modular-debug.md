# Codex 模块化调试手册

## 目的

这份文件只服务于 Codex 当前代码调试与后续实现。

目标不是解释全部业务背景，而是把当前仓库的核心模块、输入输出合同、调用链路和继续下钻的规则固定下来。  
后续写代码时，应先读这份文件，再决定是否继续打开具体源码。  
默认不要大范围扫全仓，只沿着本文件给出的模块边界继续读取。

Monorepo note:
- Unless a section explicitly says `extensions/agentils-vscode` or `packages/cli`, every `src/...` path in this document now resolves to `packages/mcp/src/...`.
- Every `test/...` path in this document now resolves to `packages/mcp/test/...`.

---

## 一、给 Codex 的提示词

### 1. 最小上下文调试提示词

```text
你当前在 AgentILS 仓库中工作。

先只阅读 `.hc/codex-modular-debug.md`，不要先全仓扫描。

你的任务是：
1. 先判断问题落在哪条主链路：
   - task start
   - approval
   - feedback
   - verify
   - conversation state
   - summary
2. 只根据本文件列出的“模块 A -> 模块 B”输入输出合同定位最小模块集合。
3. 只打开这条链路上必要的文件，不要扩展到无关模块。
4. 优先核对：
   - 上游出参是否满足下游入参
   - 中间层是否改写了关键字段
   - 状态是否存在双重真值来源
5. 如果发现问题，先指出是：
   - 入参不合法
   - 出参不完整
   - 状态转移错误
   - 模块边界错误
   - 真值源分叉

输出时使用：
- 问题所在链路
- 最小相关模块
- 关键入参/出参
- 建议继续读取的下一个文件
```

### 2. 精准改动提示词

```text
你只允许沿着 `.hc/codex-modular-debug.md` 中已经定义的调用链路修改代码。

要求：
1. 先写出你要改的是哪条链路。
2. 明确列出：
   - 上游模块名
   - 上游出参
   - 下游模块名
   - 下游入参
3. 说明当前不一致点。
4. 只修改该不一致点，不做顺手重构。
5. 改完后至少验证：
   - 类型检查
   - 对应链路的单元测试

如果当前问题需要跨越两条以上主链路，先停下来说明，不要直接扩写上下文。
```

### 3. 模块定位提示词

```text
请根据 `.hc/codex-modular-debug.md` 判断这个问题最可能属于哪个模块。

不要先解释方案。
先只输出：
1. 主链路名称
2. 入口模块
3. 中间模块
4. 真值源模块
5. 需要继续打开的 1-3 个文件

如果本文件已足够定位，就不要再扩大读取范围。
```

---

## 二、总目录

### 1. Gateway 层

- `src/gateway/server.ts`
  - 创建 `AgentGateServerRuntime`
  - 组装 `store + orchestrator + server + config`
  - 注册 tools / prompts / resources

- `src/gateway/context.ts`
  - 定义 runtime 结构
  - 定义 request-scoped `AgentGateRequestContext`
  - 负责把 `elicitInput` 包装成 `ctx.elicitUser()`

- `src/gateway/tools.ts`
  - MCP tool 入口
  - 参数校验
  - 调 orchestrator / store
  - 真实交互链路入口：`approval_request`、`feedback_gate`

- `src/gateway/resources.ts`
  - 只读资源投影
  - 主要是 conversation / task summary / control mode / taskcard / handoff / runlog

### 2. Orchestrator 层

- `src/orchestrator/orchestrator.ts`
  - 总编排入口
  - 只做聚合，不做复杂状态机细节

- `src/orchestrator/conversation-orchestrator.ts`
  - 任务启动后的 conversation 归属
  - conversation 视图与 endConversation

- `src/orchestrator/task-orchestrator.ts`
  - taskCard / handoff / controlMode / summaryPath 的 task 级更新

- `src/orchestrator/control-mode-orchestrator.ts`
  - approval / feedback / override / controlMode 推进

- `src/orchestrator/verification-orchestrator.ts`
  - verify、rollback、summary 写入

### 3. Store 层

- `src/store/memory-store.ts`
  - 运行时总状态源
  - 持有 runs / taskCards / handoffs / auditEvents / runEvents
  - 对外暴露高层读写 API

- `src/store/conversation-store.ts`
  - conversation state 真值推导
  - 当前更接近会话状态单一真值源

- `src/store/task-store.ts`
  - task 视图投影
  - 负责 `TaskRecordView` / `TaskSummary` 的轻量读取

- `src/store/summary-store.ts`
  - task summary 文档读写
  - frontmatter 组装

### 4. 类型层

- `src/types/task.ts`
  - `StartRunInput`
  - `TaskCard`
  - `RunRecord`
  - `HandoffPacket`
  - `ApprovalResult`
  - `FeedbackDecision`
  - `RunEvent`

- `src/types/conversation.ts`
  - `ConversationRecord`
  - `ConversationState`

- `src/types/control-mode.ts`
  - `ControlMode`
  - `OverrideState`

- `src/summary/summary-schema.ts`
  - `TaskSummaryDocument`
  - `TaskSummaryFrontmatter`

---

## 三、调试总原则

### 1. 优先确认 I/O 合同，不先猜实现

先确认：

- 上游模块输出了什么
- 下游模块要求什么
- 中间模块改写了哪些字段

### 2. 优先找真值源

当前仓库中最容易出现问题的是“多个地方都在推状态”。

优先怀疑：

- `conversation state`
- `controlMode`
- `overrideState`
- `summaryDocumentPath`

### 2.1 Gateway 只做适配，不做领域写入

Gateway 的职责只有：

- 解析协议输入
- 创建 request context
- 发起 `ctx.elicitUser()`
- 调用 orchestrator

Gateway 不应直接执行以下动作：

- `store.transitionRun(...)`
- `store.updateRun(...)`
- `store.appendDecision(...)`
- `store.appendRunEvent(...)`
- `controlMode` 推进
- `overrideState` 修改

如果出现这些行为，应优先判定为模块边界错误。

### 3. 一条问题只沿一条主链路下钻

如果问题属于：

- 任务启动
  - 不要先看 verify
- verify
  - 不要先看 gateway resource
- conversation state
  - 先看 `conversation-store.ts`，不要先扫 UI

---

## 四、核心调用链路

## Chain A: Server 启动链路

**主入口**

`createAgentGateServer(config, dependencies)`  
文件：`src/gateway/server.ts`

**链路**

`[gateway/server.createAgentGateServer]`
（入参：`AgentGateConfig`, `AgentGateServerDependencies`）
-> 产出 `AgentGateServerRuntime`
-> 注册：
- `[gateway/tools.registerGatewayTools]`
- `[gateway/prompts.registerGatewayPrompts]`
- `[gateway/resources.registerGatewayResources]`

**关键出参**

- `runtime.server`
- `runtime.store`
- `runtime.orchestrator`
- `runtime.config`

**继续读取规则**

- 如果是 tool 注册问题：继续看 `src/gateway/tools.ts`
- 如果是 runtime 缺字段：继续看 `src/gateway/context.ts`
- 如果是 server 创建后状态不对：继续看 `src/store/memory-store.ts`

---

## Chain B: Task Start 链路

**主入口**

- `new_task_request`
- `run_start`

文件：`src/gateway/tools.ts`

**链路**

`[gateway/tools.new_task_request|run_start]`
（入参：tool input）
-> `buildTaskStartInput`
（出参：`StartRunInput`）
-> `[orchestrator.startRun]`
（入参：`StartRunInput`）
-> `[conversation-orchestrator.startRun]`
（入参：`StartRunInput`）
-> `[memory-store.startRun]`
（入参：`StartRunInput`）
-> `[types.createTaskCard]`
（出参：`TaskCard`）
-> `[types.createRunRecord]`
（出参：`RunRecord`）
-> `[types.createHandoffPacket]`
（出参：`HandoffPacket`）
-> `[task-orchestrator.ensureSummaryDocumentPath]`
（出参：`summaryDocumentPath: string`）
-> `[task-orchestrator.setTaskControlMode]`
（出参：更新后的 `RunRecord`）
-> gateway 组装响应

**核心合同**

`[gateway/buildTaskStartInput]`
出参：`StartRunInput`

`[memory-store.startRun]`
入参：`StartRunInput`
出参：
- `RunRecord`
- 持久化后的 `TaskCard`
- 持久化后的 `HandoffPacket`

`[task-orchestrator.ensureSummaryDocumentPath]`
入参：`runId`
出参：`summaryDocumentPath`

**调试关注点**

- `mode` 是否正确进入 `currentMode`
- `controlMode` 是否正确写入 `TaskCard` 和 `RunRecord`
- `summaryDocumentPath` 是否在 start 后补齐

**继续读取文件**

1. `src/gateway/tools.ts`
2. `src/orchestrator/conversation-orchestrator.ts`
3. `src/store/memory-store.ts`
4. `src/types/task.ts`

---

## Chain C: Approval 链路

**主入口**

`approval_request`  
文件：`src/gateway/tools.ts`

**当前实现存在的边界问题**

当前 `approval_request` 不是纯粹的转发链路。  
Gateway 在调用 `ctx.elicitUser()` 之前，已经直接执行了：

- `store.transitionRun(...)`
- `store.updateRun(...)`

这属于 Gateway 越过 Orchestrator 直接写领域状态，是当前 approval 链路的已知结构瑕疵。

**链路**

`[gateway/tools.approval_request]`
（入参：`{ runId, summary, riskLevel, toolName?, targets? }`）
-> `[gateway/tools.createToolRequestContext]`
（出参：`AgentGateRequestContext`）
-> `[store.transitionRun]`
（写入：`approval / awaiting_approval`）
-> `[store.updateRun]`
（写入：初始 `activeApproval`）
-> `[ctx.elicitUser]`
（出参：`AgentGateElicitResult`）
-> `ApprovalResultSchema.parse`
（出参：`ApprovalResult`）
-> `[orchestrator.recordApproval]`
（入参：`runId, summary, ApprovalResult`）
-> `[control-mode-orchestrator.recordApproval]`
-> 可能继续：
  - `store.transitionRun`
  - `store.confirmDone`
  - `task.setTaskOverrideState`
  - `applyControlModeSignal`
  - `store.updateRun`
  - `store.appendDecision`
  - `store.appendRunEvent`

**核心合同**

`[ctx.elicitUser]`
出参：
- `action`
- `content`

`[ApprovalResultSchema.parse]`
出参：`ApprovalResult`
结构：
- `action: 'accept' | 'cancel' | 'decline'`
- `payload?: { status: 'continue' | 'done' | 'revise', msg: string }`

`[control-mode-orchestrator.recordApproval]`
入参：`ApprovalResult`
出参：解析后的 `ApprovalResult`
副作用：
- 更新 `currentStep/currentStatus`
- 更新 `overrideState`
- 更新 `controlMode`
- 写 decision / runEvent / audit

**典型分支**

`accept + continue`
-> `execute / active`
-> 若之前是 `normal`，通常推进到 `alternate`

`accept + done`
-> `verify / active`
-> `userConfirmedDone = true`

`accept + revise`
-> `confirm_elements / awaiting_user`

`cancel`
-> 保持 `approval / awaiting_approval`

`decline`
-> `cancelled / cancelled`

**目标整改形态**

Approval 链路应收敛为：

`[gateway/tools.approval_request]`
（解析 MCP 输入 + 创建 `ctx`）
-> `[orchestrator.beginApprovalRequest]`
（开始挂起审批，写初始审批状态）
-> `[ctx.elicitUser]`
（收集用户审批结果）
-> `[orchestrator.recordApproval]`
（记录审批结果并推进领域状态）

也就是说：

- Gateway 可以发起交互
- Gateway 不得直接写 Store
- 领域状态只能由 Orchestrator 驱动 Store 更新

**继续读取文件**

1. `src/gateway/tools.ts`
2. `src/gateway/context.ts`
3. `src/orchestrator/control-mode-orchestrator.ts`
4. `src/control/mode-transitions.ts`
5. `src/types/task.ts`

---

## Chain D: Feedback 链路

**主入口**

`feedback_gate`  
文件：`src/gateway/tools.ts`

**当前边界情况**

`feedback_gate` 当前比 `approval_request` 更接近目标结构：

- Gateway 负责 `ctx.elicitUser()`
- 结果交给 `orchestrator.recordFeedback(...)`

后续 Wave B 仍应继续收紧边界，但当前 feedback 链路没有 approval 那种“先由 Gateway 直接写 Store”的明显越权。

**链路**

`[gateway/tools.feedback_gate]`
（入参：`{ runId, summary }`）
-> `[gateway/tools.createToolRequestContext]`
（出参：`AgentGateRequestContext`）
-> `[ctx.elicitUser]`
（出参：`AgentGateElicitResult`）
-> `FeedbackDecisionSchema.parse`
（出参：`FeedbackDecision`）
-> `[orchestrator.recordFeedback]`
（入参：`runId, FeedbackDecision`）
-> `[control-mode-orchestrator.recordFeedback]`
-> 可能继续：
  - `store.transitionRun`
  - `store.confirmDone`
  - `store.updateRun`
  - `store.appendDecision`
  - `store.appendRunEvent`

**核心合同**

`[FeedbackDecisionSchema.parse]`
出参：`FeedbackDecision`
结构：
- `status: 'continue' | 'done' | 'revise'`
- `msg: string`

`[control-mode-orchestrator.recordFeedback]`
副作用：

- `done` -> `verify / active` + `userConfirmedDone = true`
- `revise` -> `confirm_elements / awaiting_user`
- `continue` -> `execute / active`

**继续读取文件**

1. `src/gateway/tools.ts`
2. `src/orchestrator/control-mode-orchestrator.ts`
3. `src/types/task.ts`

---

## Chain E: Verify 链路

**主入口**

`verify_run`  
文件：`src/gateway/tools.ts`

**链路**

`[gateway/tools.verify_run]`
（入参：`{ runId, userConfirmedDone }`）
-> `[orchestrator.verifyRun]`
（入参：`runId, userConfirmedDone`）
-> `[verification-orchestrator.verifyRun]`
-> `[verification-orchestrator.evaluateVerification]`
（出参：`VerifyRunResult`）
-> `store.markVerification`
-> `store.appendRunEvent('verify.finished')`
-> 分支：

### Pass 分支

`verificationStatus.resultVerified && verificationStatus.handoffVerified && userConfirmedDone`
-> `store.transitionRun('done', 'completed')`
-> `task.ensureSummaryDocumentPath`
-> `store.writeTaskSummary`
（入参：`SummaryWriteInput`）
-> `store.appendRunEvent('run.completed')`
-> 返回 `VerifyRunResult`

### Rollback 分支

若不满足完成条件：
-> `resolveRollback`
-> `store.transitionRun(rollback.step, rollback.status)`
-> `store.appendRunEvent('verify.rollback')`
-> 返回带 rollback 信息的 `VerifyRunResult`

**核心合同**

`[verification-orchestrator.evaluateVerification]`
出参：
- `verdict`
- `reasons`
- `verificationStatus`

`[store.writeTaskSummary]`
入参：`SummaryWriteInput`
出参：`TaskSummaryDocument`

**调试关注点**

- 为什么没有进入 `completed`
- 为什么 summary 没写出来
- 为什么 verify 后被回滚到 `verify` / `plan` / `confirm_elements`

**继续读取文件**

1. `src/orchestrator/verification-orchestrator.ts`
2. `src/store/summary-store.ts`
3. `src/summary/summary-schema.ts`
4. `src/types/task.ts`

---

## Chain F: Conversation State 读取链路

**主入口**

- `conversation_get`
- `conversation://current`
- 其他读取 `store.getConversationRecord()` 的调用方

**推荐真值源**

优先看：`src/store/conversation-store.ts`

**链路**

`[gateway/tools.conversation_get]`
-> `readActiveRunSnapshot`
-> `store.getConversationRecord()`
-> `[conversation-store.getRecord]`
-> `[conversation-store.deriveConversationState]`
-> 返回 `ConversationRecord`

同时 gateway 会附带：

- `taskRecord = store.getTaskRecord(runId, summaryDocumentPath)`
- `taskSummary = store.getTaskSummary(runId)`
- `summaryDocument = store.readTaskSummary(taskId)`
- `nextAction = conversationStore.summarizeNextAction(run, overrideState)`

**核心合同**

`[conversation-store.deriveConversationState]`
入参：`RunRecord | null`
出参：`ConversationState`

规则摘要：

- 无 run -> `await_next_task`
- 有 `conversation.completed` 事件 -> `conversation_done`
- `awaiting_user / awaiting_approval / budget_exceeded / failed` -> `conversation_blocked`
- `completed / cancelled` -> `await_next_task`
- 其余 -> `active_task`

**重要说明**

当前仓库里，conversation state 存在不止一处推导逻辑。  
如果是“会话状态为什么不对”的问题，先以 `conversation-store.ts` 为准，再对照其他层是否分叉。

**继续读取文件**

1. `src/store/conversation-store.ts`
2. `src/store/memory-store.ts`
3. `src/gateway/tools.ts`
4. `src/orchestrator/conversation-orchestrator.ts`

---

## Chain G: Conversation End 链路

**主入口**

`conversation_end`  
文件：`src/gateway/tools.ts`

**链路**

`[gateway/tools.conversation_end]`
（入参：`{ runId? }`）
-> `[orchestrator.endConversation]`
-> `[conversation-orchestrator.endConversation]`
-> `getConversationRecord(runId)`
-> 若 `activeTaskId` 非空则抛错
-> `store.appendRunEvent('conversation.completed')`
-> 返回 `getConversationRecord(runId)`

**核心合同**

`[conversation-orchestrator.endConversation]`
入参：`preferredRunId?: string | null`
出参：`ConversationRecord`

**调试关注点**

- 为什么 endConversation 被拒绝
- 为什么写了 `conversation.completed` 仍然看不到 `conversation_done`

**继续读取文件**

1. `src/orchestrator/conversation-orchestrator.ts`
2. `src/store/conversation-store.ts`
3. `scripts/runtime/state-reader.mjs`

---

## Chain H: Summary 文档链路

**主入口**

- verify 成功写 summary
- `task_summary_get`
- `task-summary://{runId}`

**链路**

`[verification-orchestrator.verifyRun]`
-> `store.writeTaskSummary`
-> `[summary-store.writeSummary]`
-> `createTaskSummaryDocument`
-> `writeTaskSummaryDocument`
-> 文档写入 `.data/agentils-summaries/<taskId>/task-summary.md`

读取时：

`[gateway/tools.task_summary_get]`
-> `store.readTaskSummary(taskId)`
-> `[summary-store.readSummary]`
-> `readTaskSummaryDocument`

**核心合同**

`[SummaryWriteInput]`
入参：

- `taskId`
- `runId`
- `conversationId`
- `taskTitle`
- `outcome`
- `body`
- `controlMode`
- `taskStatus`
- `touchedFiles`
- `residualRisks`
- `openQuestions`
- `assumptions`
- `decisionNeededFromUser`
- `nextTaskHints`
- `overrideState`

`[TaskSummaryDocument]`
出参：

- `frontmatter`
- `body`
- `path`

**继续读取文件**

1. `src/store/summary-store.ts`
2. `src/summary/summary-schema.ts`
3. `src/orchestrator/verification-orchestrator.ts`

---

## 五、最常见的定位模式

### 1. “tool 调完了，但状态没变”

先走：

`gateway/tools.ts`
-> `orchestrator/*.ts`
-> `memory-store.ts.updateRun / transitionRun / patchTaskCard`

### 2. “conversation 状态不对”

先走：

`store/conversation-store.ts`
-> `memory-store.ts.listRunEvents`
-> `orchestrator/conversation-orchestrator.ts`

### 3. “summary 没写出来 / 字段不全”

先走：

`verification-orchestrator.ts`
-> `store/summary-store.ts`
-> `summary/summary-schema.ts`

### 4. “controlMode / overrideState 不对”

先走：

`control-mode-orchestrator.ts`
-> `control/mode-transitions.ts`
-> `types/control-mode.ts`

### 5. “交互链路不对”

先走：

`gateway/context.ts`
-> `gateway/tools.ts`
-> 对应单测：`test/gateway/request-context.test.ts`

---

## 六、不要先读的地方

如果问题还没定位到以下范围，不要先展开：

- `extensions/*`
- `docs/*`
- `scripts/flowcharts/*`
- UI helper
- VS Code host

这些模块不是当前 runtime 主链路的第一现场。

---

## 七、当前第一优先级真值源

如果只能先信一层，当前建议优先级如下：

1. task / run 原始状态：`src/store/memory-store.ts`
2. conversation state：`src/store/conversation-store.ts`
3. 类型合同：`src/types/task.ts`、`src/types/conversation.ts`、`src/types/control-mode.ts`
4. summary 合同：`src/summary/summary-schema.ts`
5. gateway 输入输出：`src/gateway/tools.ts`

---

## 八、单文件快速定位表

### 想知道“某个 tool 最终改了什么状态”

先看：`src/gateway/tools.ts`  
再看：对应 orchestrator  
最后看：`src/store/memory-store.ts`

### 想知道“某个状态字段是谁定义的”

先看：`src/types/task.ts` / `src/types/conversation.ts` / `src/types/control-mode.ts`

### 想知道“某个视图字段为什么这样显示”

先看：

- conversation 相关：`src/store/conversation-store.ts`
- task 相关：`src/store/task-store.ts`
- summary 相关：`src/store/summary-store.ts`

### 想知道“哪里写了 run event / audit”

先看：

- `src/store/memory-store.ts`
- `src/orchestrator/control-mode-orchestrator.ts`
- `src/orchestrator/verification-orchestrator.ts`
- `src/orchestrator/task-orchestrator.ts`

---

## 九、维护规则

后续如果新增主链路，必须在本文件补三样东西：

1. 主入口
2. 模块 A -> 模块 B 的入参/出参合同
3. 出问题时优先继续读的文件顺序

如果做不到这三点，就说明模块边界还没清楚，不适合继续扩写实现。
