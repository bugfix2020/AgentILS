# AgentILS Implementation Plan V1
# AgentILS 实施计划 V1

## Goal / 目标

This document is the execution plan for implementing the design in [conversation-task-design-v1.md](/Users/liuyuxuan/Desktop/Lenovo/agent-gate/docs/agentils/conversation-task-design-v1.md).

本文是 [conversation-task-design-v1.md](/Users/liuyuxuan/Desktop/Lenovo/agent-gate/docs/agentils/conversation-task-design-v1.md) 的实施计划文档。

It is intentionally module-oriented and subagent-oriented.

它刻意按“模块”和“子代理协作”来拆分，而不是按抽象功能点描述。

The implementation target is:

实施目标如下：

- upgrade the current single-task runtime into a `conversation + task` two-layer system
- 将当前单任务 runtime 升级成 `conversation + task` 双层系统
- make `task summary document` the only default cross-task memory artifact
- 让 `task summary document` 成为默认唯一跨任务继承工件
- implement `normal / alternate / direct` control modes
- 实现 `normal / alternate / direct` 控制模式
- separate `task stop` from `conversation stop`
- 分离 `task stop` 与 `conversation stop`
- keep VS Code native customizations thin and move task control UX into WebView
- 保持 VS Code 原生 customizations 轻量，把任务控制 UX 放到 WebView
- add a real VS Code plugin host and remote/local UI bridge
- 增加真实的 VS Code 插件宿主与 remote/local UI bridge

## Implementation Principles / 实施原则

1. Lock interfaces first, then parallelize implementation.  
   先锁接口，再并行实现。
2. Split by module boundary, not by vague feature wording.  
   按模块边界拆分，不按模糊功能描述拆分。
3. Subagents should own disjoint write scopes whenever possible.  
   子代理尽量拥有不重叠的写入范围。
4. Runtime logic belongs in `src/*`, hook scripts are bridges only.  
   运行时逻辑放在 `src/*`，hook 脚本只做桥接。
5. WebView is a control surface, not the source of truth.  
   WebView 是控制面，不是真实状态源。
6. The plan must support unattended execution with bounded parallelism.  
   该计划必须支持“无人值守执行”，但并发度必须受控。

## Current Gap Summary / 当前缺口摘要

The repository already has a working single-task skeleton:

仓库当前已经有一套可工作的单任务骨架：

- MCP server and tools
- taskCard / handoff / verify / approval / feedback
- persistent JSON runtime state
- hook skeleton with real gate behavior

But it still lacks:

但仍缺少：

- conversation-level state
- task-scoped summary document model
- control mode model
- explicit new-task flow
- task stop vs conversation stop separation
- WebView task console
- VS Code plugin host
- remote/local UI bridge

## Must-Lock Interfaces Before Parallel Coding / 并行编码前必须锁定的接口

These five interfaces must be treated as phase-0 deliverables.

这 5 个接口必须作为第 0 阶段的锁定物。

1. `ConversationRecord`
2. `TaskRecord`
3. `TaskSummaryDocument`
4. `ControlMode`
5. `OverrideState`

Without these five, `store / orchestrator / hooks / summary / gateway / webview` will all drift.

如果这 5 个接口不先稳定，`store / orchestrator / hooks / summary / gateway / webview` 会一起漂移并反复返工。

## Unattended Execution Mode / 无人值守执行模式

This plan is intended to run with minimal user intervention once execution starts.

本计划设计目标之一，就是在启动执行后尽量减少用户干预，实现“无人值守”推进。

### Parallelism budget / 并发预算

Maximum concurrent subagents: `6`

最大并发子代理数：`6`

This limit should be treated as a hard scheduler constraint.

这个限制必须被视为硬调度约束。

Do not open more than 6 concurrent worker threads at the same time.

任何时刻都不要同时打开超过 6 个并行子代理线程。

### Execution rule / 执行规则

The system should execute in controlled batches instead of opening every workstream at once.

系统不应一次性把所有工作流全部展开，而应按受控批次执行。

Recommended unattended behavior:

推荐的无人值守执行规则：

1. Freeze contracts first.  
   先冻结 contracts。
2. Start only the batch that is dependency-safe.  
   只启动依赖安全的那一批。
3. Wait for the batch to finish.  
   等这一批完成。
4. Integrate, validate, and resolve compatibility issues centrally.  
   由主代理统一集成、验证、解决兼容问题。
5. Launch the next batch only after the current foundation is stable.  
   当前基础层稳定后，再启动下一批。

### Why this matters / 为什么这样做

Unattended execution fails when:

无人值守执行最容易在这些情况下失控：

- too many overlapping write scopes
- 写入范围重叠过多
- contracts are still moving while workers are coding
- contracts 还在变化，子代理已经开始写代码
- gateway/orchestrator/UI start changing before state/store is stable
- state/store 未稳定时，gateway/orchestrator/UI 已经开始变化

So the unattended strategy is:

因此无人值守策略应是：

- fewer concurrent workers
- 更少但更稳的并行子代理
- harder ownership boundaries
- 更硬的所有权边界
- central integration between batches
- 批次之间由主代理统一集成

## Target Module Map / 目标模块地图

### Types / 类型层

- `src/types/conversation.ts`
- `src/types/task.ts`
- `src/types/control-mode.ts`
- `src/types/summary.ts`
- `src/types/hook.ts`
- `src/types/index.ts`

### Store / 存储层

- `src/store/conversation-store.ts`
- `src/store/task-store.ts`
- `src/store/summary-store.ts`
- `src/store/audit-store.ts`
- `src/store/persistence/json-store.ts`
- `src/store/index.ts`

### Summary / Summary 模块

- `src/summary/summary-schema.ts`
- `src/summary/summary-writer.ts`
- `src/summary/summary-loader.ts`
- `src/summary/index.ts`

### Control / 控制模式与 override

- `src/control/control-modes.ts`
- `src/control/override-policy.ts`
- `src/control/mode-transitions.ts`
- `src/control/gate-evaluators.ts`
- `src/control/index.ts`

### Orchestrator / 编排层

- `src/orchestrator/conversation-orchestrator.ts`
- `src/orchestrator/task-orchestrator.ts`
- `src/orchestrator/control-mode-orchestrator.ts`
- `src/orchestrator/verification-orchestrator.ts`
- `src/orchestrator/index.ts`

### Gateway / MCP 面

- `src/gateway/server.ts`
- `src/gateway/context.ts`
- `src/gateway/shared.ts`
- `src/gateway/tools.ts`
- `src/gateway/resources.ts`
- `src/gateway/prompts.ts`
- `src/gateway/transports.ts`
- `src/gateway/gateway.ts`

### Task Surface API / UI 后端接口层

- `src/control-plane/conversation-service.ts`
- `src/control-plane/task-service.ts`
- `src/control-plane/summary-service.ts`
- `src/control-plane/override-service.ts`
- `src/control-plane/index.ts`

### Hook Runtime / Hook 运行时

- `scripts/runtime/hook-common.mjs`
- `scripts/runtime/state-reader.mjs`
- `scripts/gates/task-approval.mjs`
- `scripts/gates/task-post-verify.mjs`
- `scripts/gates/task-stop.mjs`
- `scripts/gates/conversation-stop.mjs`
- `scripts/gates/audit-log.mjs`

### VS Code Surface / VS Code 承载层

- `.github/agents/*`
- `.github/prompts/*`
- `.github/hooks/*`
- `extensions/agentils-vscode/*` or chosen extension host path
- `extensions/agentils-ui-helper/*` or chosen local UI bridge path
- `webview/*` or extension-side webview host module

### VS Code Plugin Host / VS Code 插件宿主层

- `extensions/agentils-vscode/package.json`
- `extensions/agentils-vscode/src/extension.ts`
- `extensions/agentils-vscode/src/commands/*`
- `extensions/agentils-vscode/src/chat/*`
- `extensions/agentils-vscode/src/lm-tools/*`
- `extensions/agentils-vscode/src/webview/*`
- `extensions/agentils-vscode/src/status/*`

### Remote UI Bridge / 远程 UI 桥接层

- `extensions/agentils-ui-helper/package.json`
- `extensions/agentils-ui-helper/src/extension.ts`
- `extensions/agentils-ui-helper/src/bridge/*`
- `extensions/agentils-ui-helper/src/local-files/*`
- `extensions/agentils-ui-helper/src/prompts/*`

## Plugin Surface Boundaries / 插件承载边界

The complete AgentILS solution should be split across four product surfaces.

完整的 AgentILS 方案应拆成四个承载面：

### 1. MCP / Runtime

Owns:

- conversation/task state
- summary lifecycle
- override and control mode
- verification logic
- hook evaluation logic
- MCP tools/resources/prompts

负责：

- conversation/task 状态
- summary 生命周期
- override 与 control mode
- verification 逻辑
- hook 判定逻辑
- MCP tools/resources/prompts

### 2. Native VS Code Customizations

Owns:

- custom agents
- prompt files
- declarative hook registration
- global instructions

负责：

- custom agents
- prompt files
- 声明式 hook 注册
- 全局 instructions

This surface should stay thin.

这一层必须保持轻量。

### 3. VS Code Plugin Host

Owns:

- command registry
- chat participant
- LM tools registration
- WebView hosting
- status bar or lightweight telemetry surface

负责：

- command registry
- chat participant
- LM tools 注册
- WebView 宿主
- status bar 或轻量 telemetry surface

### 4. Remote UI Bridge

Owns:

- remote window detection
- local prompt and local file bridge
- summary opening and local editing bridge
- user-home or UI-side resource access

负责：

- remote window 判断
- 本地 prompt 与本地文件桥接
- summary 打开与本地编辑桥接
- 用户目录或 UI 侧资源访问

## WebView Task Console / WebView 任务控制台

The WebView is not optional in the full plan. It is the primary task control console.

在完整方案中，WebView 不是可选项，而是主任务控制台。

It should own:

它应承载：

- explicit `New task` entry
- current task status
- summary generated notice
- summary edit entry
- override risk acknowledgement
- control mode banner: `normal / alternate / direct`
- fixed notice that pause/resume is not supported in this version
- check-list style guidance for non-technical users

### Recommended WebView sections / 推荐 WebView 分区

- `Current Task`
- `Summary Notice`
- `Override Risk Gate`
- `New Task Entry`
- `Control Mode Banner`
- `Task Limitations`

## Task Control UX / 任务控制交互

The product should not rely on free-form chat alone for task lifecycle control.

产品不能只依赖自由文本聊天来驱动 task 生命周期。

Explicit task actions should be available through commands, chat participant entry, or WebView buttons.

显式任务动作应通过 commands、chat participant 入口或 WebView 按钮提供。

Required user-visible actions:

必须提供给用户的显式动作：

- `New task`
- `Continue task`
- `Mark task done`
- `Accept override`
- `Open summary`
- `Open task console`

These actions should not depend on the model guessing user intent.

这些动作不能依赖模型去猜测用户意图。

## VS Code Plugin Host / VS Code 插件宿主

The main extension host should be a real VS Code extension, not just a passive MCP wrapper.

主扩展宿主必须是真实的 VS Code extension，而不是被动 MCP wrapper。

Recommended responsibilities:

建议职责：

- activate on startup in lightweight mode
- register commands
- register chat participant
- register LM tools where appropriate
- host the WebView console
- mediate between VS Code UI and AgentILS task surface API

Recommended non-goals:

建议非目标：

- do not store business truth inside the extension host
- do not make the WebView the source of truth
- do not duplicate runtime state logic inside VS Code UI code

## Remote UI Bridge / 远程 UI 桥接

The VSIX reference analysis shows that a separate UI-side helper is valuable when the extension host runs in a remote environment.

VSIX 参考分析表明：当 extension host 跑在 remote 环境中时，独立的 UI-side helper 很有价值。

Recommended responsibilities:

建议职责：

- detect remote window via VS Code APIs
- register bridge commands only when needed
- expose local prompt enumeration
- expose local file read/open for summaries and prompt files
- avoid mixing workspace-host logic with UI-host-only capabilities

This should be treated as its own module, not as an afterthought inside WebView code.

它应作为独立模块存在，而不是塞进 WebView 代码里的附属逻辑。

## Current Execution Status / 当前执行状态

- `Wave 0`: complete
- `Wave 0`：已完成
- `Wave 1`: complete
- `Wave 1`：已完成
- `Wave 2`: complete
- `Wave 2`：已完成
- `Wave 3`: in progress, VS Code host, UI helper, and .github customizations have landed and are being integrated
- `Wave 3`：进行中，VS Code 宿主、UI helper 与 `.github` customizations 已落地，正在统一集成
- `Wave 4`: not started
- `Wave 4`：未开始

## Execution Waves / 实施波次

## Wave 0 / 第 0 波：Lock Contracts

Objective:

目标：

- freeze schemas and ownership boundaries
- 锁定 schema 和职责边界

Deliverables:

交付物：

- `ConversationRecord`
- `TaskRecord`
- `TaskSummaryDocument`
- `ControlMode`
- `OverrideState`
- file layout decision
- persistence path decision

Write scope:

写入范围：

- `src/types/*`
- `docs/agentils/*` if schema notes must be updated

Dependency:

依赖：

- none

## Wave 1 / 第 1 波：Foundations That Can Parallelize

Objective:

目标：

- implement storage and runtime foundations once contracts are fixed
- 在 contracts 固定后，落地存储与运行时基础层

Parallel workstreams:

可并行工作流：

### Workstream A: Types

Write scope:

- `src/types/*`

Responsibilities:

- split current `src/types/index.ts`
- define conversation/task/control-mode/summary/hook schemas
- keep `index.ts` as re-export boundary

### Workstream B: Store

Write scope:

- `src/store/*`

Responsibilities:

- split current `memory-store.ts`
- introduce conversation/task/summary/audit store separation
- keep JSON persistence stable
- preserve backward-safe migration strategy if existing state file exists

### Workstream C: Hook Runtime Bridge

Write scope:

- `scripts/runtime/*`
- `scripts/gates/*`

Responsibilities:

- move business gate logic out of ad hoc scripts
- keep scripts as IO bridge only
- prepare `task-stop` and `conversation-stop` as separate concepts

Dependency note:

依赖说明：

- Workstream C depends on stable type names and persisted field names from A and B

## Wave 2 / 第 2 波：Behavior Layer

Objective:

目标：

- implement task progression, conversation progression, summary lifecycle, and control modes
- 实现任务推进、会话推进、summary 生命周期和控制模式

Parallel workstreams:

### Workstream D: Orchestrator

Write scope:

- `src/orchestrator/*`

Responsibilities:

- split single orchestrator into conversation/task/control-mode/verification orchestrators
- ensure control mode transitions are runtime-owned, not hook-owned
- keep override task-scoped only

### Workstream E: Summary Module

Write scope:

- `src/summary/*`
- `src/store/summary-store.ts`

Responsibilities:

- write summary document format
- load summary document
- archive summary on task completion
- expose summaryDocumentPath in task state

### Workstream F: Gateway Registry Split

Write scope:

- `src/gateway/*`

Responsibilities:

- split server bootstrap from tools/resources/prompts/transports
- add conversation-aware and summary-aware tools
- prepare stable MCP surface for native customizations and WebView

Dependency note:

依赖说明：

- D depends on Wave 1 store
- E depends on Wave 1 types/store
- F depends on D and E interfaces but can start with registry splitting early

## Wave 3 / 第 3 波：Product Surfaces

Objective:

目标：

- expose the control system to users through native VS Code entry points and WebView
- 通过原生 VS Code 入口和 WebView 向用户暴露控制系统

Parallel workstreams:

### Workstream G: Native VS Code Customizations

Write scope:

- `.github/agents/*`
- `.github/prompts/*`
- `.github/hooks/*`
- `.github/copilot-instructions.md`
- `.github/instructions/*`

Responsibilities:

- keep native customizations thin
- update prompts to reflect new task lifecycle
- keep hooks declarative and script-driven
- avoid UI-specific logic here

### Workstream H: VS Code Plugin Host

Write scope:

- `extensions/agentils-vscode/*`

Responsibilities:

- create the real VS Code extension host
- register commands
- register chat participant
- register LM tools where needed
- host the WebView console shell
- connect VS Code-side actions to task surface APIs

### Workstream I: Task Surface API

Write scope:

- `src/control-plane/*`

Responsibilities:

- provide stable APIs for WebView and extension host
- avoid direct WebView-to-MCP glue logic
- expose current task state, summary state, override state, control mode, and new-task entry

### Workstream J: WebView Console

Write scope:

- `webview/*` or extension-side webview host module

Responsibilities:

- explicit `New task` entry
- current task state view
- summary notice after task completion
- override risk acknowledgement
- control mode banner
- fixed notice that pause/resume is not supported in this version
- non-technical-user task guidance

### Workstream K: Remote UI Bridge

Write scope:

- `extensions/agentils-ui-helper/*`

Responsibilities:

- remote window detection
- local prompt/file bridge
- summary open/read bridge
- UI-side resource access for remote scenarios


Dependency note:

依赖说明：

- H depends on Wave 2 MCP surface semantics
- I depends on H
- J depends on H
- K depends on summary file paths and local resource contracts
- G should start only after MCP surface names stabilize

## Wave 4 / 第 4 波：Integration And Verification

Objective:

目标：

- verify that the split architecture still behaves as one coherent control system
- 验证拆分后的架构仍能作为统一控制系统工作

Write scope:

- integration tests
- smoke tests
- docs updates
- final hook behavior verification

Responsibilities:

- verify `task_done != conversation_done`
- verify summary document is generated every task
- verify next task inherits summary, not transcript
- verify repeated override changes control mode
- verify direct mode preserves minimal audit and warnings
- verify task-stop and conversation-stop are separate

## Subagent Assignment Strategy / 子代理分工策略

Each subagent should have a clean write scope.

每个子代理都应拥有尽量干净的写入范围。

Recommended initial assignment:

推荐初始分工：

| Subagent | Ownership / 写入所有权 | Wave |
|---|---|---|
| Agent 1 | `src/types/*` | Wave 0-1 |
| Agent 2 | `src/store/*` | Wave 1 |
| Agent 3 | `scripts/runtime/*`, `scripts/gates/*` | Wave 1 |
| Agent 4 | `src/orchestrator/*` | Wave 2 |
| Agent 5 | `src/summary/*` | Wave 2 |
| Agent 6 | `src/gateway/*` | Wave 2 |
| Agent 7 | `src/control-plane/*` | Wave 3 |
| Agent 8 | `.github/*` customizations | Wave 3 |
| Agent 9 | `extensions/agentils-vscode/*` | Wave 3 |
| Agent 10 | `webview/*` | Wave 3 |
| Agent 11 | `extensions/agentils-ui-helper/*` | Wave 3 |
| Agent 12 | integration tests and final verification | Wave 4 |

### Important scheduling note / 重要调度说明

The table above defines ownership, not simultaneous launch count.

上表定义的是所有权，不代表要同时启动这么多子代理。

Because the hard parallel limit is `6`, these agents must be launched in batches.

由于硬并发上限是 `6`，这些子代理必须按批次启动。

### Recommended unattended batches / 推荐无人值守批次

#### Batch A / 批次 A

Goal:

目标：

- finish Wave 0 and Wave 1 foundations
- 完成 Wave 0 与 Wave 1 基础层

Concurrent workers:

并发子代理：

1. `types`
2. `store`
3. `hooks runtime`
4. `summary`
5. optional compatibility reviewer

This batch should never exceed 5 workers plus the main integrator.

这一批不应超过 5 个 worker，再加 1 个主集成代理。

#### Batch B / 批次 B

Goal:

目标：

- finish Wave 2 runtime behavior
- 完成 Wave 2 运行时行为层

Concurrent workers:

并发子代理：

1. `orchestrator`
2. `gateway`
3. `control-plane API`
4. optional runtime integration verifier

#### Batch C / 批次 C

Goal:

目标：

- finish Wave 3 product surfaces
- 完成 Wave 3 产品承载层

Concurrent workers:

并发子代理：

1. `.github` customizations
2. VS Code plugin host
3. WebView console
4. remote UI bridge
5. optional UX/integration reviewer

#### Batch D / 批次 D

Goal:

目标：

- finish Wave 4 verification and release prep
- 完成 Wave 4 验证与发布前收口

Concurrent workers:

并发子代理：

1. integration tests
2. docs and release surface verification
3. final compatibility reviewer

Subagent rules:

子代理规则：

- do not cross-edit another agent's owned directory unless integration requires it
- 不要跨改别的子代理负责目录，除非集成阶段确实需要
- do not move interface names after Wave 0 is complete
- Wave 0 完成后不要再改接口命名
- prefer adapters over breaking rewrites
- 优先写 adapter，而不是破坏式重写
- when running unattended, the main integrator must always validate between batches
- 无人值守执行时，主集成代理必须在每一批之间做统一验证

## Unattended Completion Criteria / 无人值守完成判据

Unattended execution is only acceptable when:

只有满足以下条件时，才允许无人值守持续执行：

- current batch has a frozen contract boundary
- 当前批次的 contract boundary 已冻结
- worker write scopes are disjoint
- 子代理写入范围彼此独立
- the branch builds after every batch
- 每一批结束后分支都能 build
- integration is committed before the next batch starts
- 下一批开始前，集成结果已提交

If any batch breaks these rules, unattended execution should pause and return to central integration first.

如果任何一批打破这些规则，无人值守执行应先暂停，回到主代理统一集成后再继续。

## Non-Goals For This Version / 本版本非目标

- task pause and resume
- 任务暂停与恢复
- automatic detection that the user finished editing summary
- 自动检测用户何时编辑完成 summary
- multi-active-task scheduling
- 多个 active task 并行调度
- fine-grained control of LLM internal reasoning
- 细粒度控制 LLM 内部推理

## Acceptance Criteria / 验收标准

Implementation can be considered complete only when all of the following are true:

只有满足以下条件，才算实现完成：

1. A conversation can contain multiple tasks, but only one active task at a time.  
   一个 conversation 可包含多个 tasks，但同一时刻只有一个 active task。
2. Ending a task does not end the conversation.  
   结束 task 不会结束 conversation。
3. Every task writes a summary document to disk.  
   每个 task 都会在磁盘写出 summary 文档。
4. New tasks inherit summary, not raw transcript.  
   新 task 继承 summary，而不是 raw transcript。
5. Override is task-scoped only.  
   override 仅在 task 级生效。
6. Repeated override transitions control mode.  
   连续 override 会切换 control mode。
7. Direct mode still leaves minimal audit and user-visible warnings.  
   direct mode 仍保留最小审计和用户可见警示。
8. Task-stop and conversation-stop are separate checks.  
   task-stop 与 conversation-stop 是分离检查。
9. Native VS Code customizations remain thin.  
   原生 VS Code customizations 仍保持轻量。
10. WebView becomes the main task control console.  
    WebView 成为主任务控制台。
11. A real VS Code plugin host exists and owns commands/chat/WebView hosting.  
    存在真实的 VS Code 插件宿主，并负责 commands/chat/WebView hosting。
12. Remote scenarios can still access local prompt/file actions through a UI bridge.  
    remote 场景下仍可通过 UI bridge 访问本地 prompt/file 能力。

## Immediate Next Action / 立即下一步

Start with Wave 0 and treat it as a hard contract phase.

先做 Wave 0，并把它当作强制合同阶段。

No subagent should start writing `store / orchestrator / gateway / webview` code until the five core interfaces are frozen.

在 5 个核心接口冻结之前，不应让任何子代理开始写 `store / orchestrator / gateway / webview` 代码。
