# AgentILS Conversation And Task Design V1
# AgentILS 会话与任务设计 V1

## Purpose / 目的

This document defines the next-stage design for AgentILS as a multi-task conversation manager rather than a single linear task runner.

本文定义 AgentILS 的下一阶段设计目标：它应当是一个支持多任务的会话管理器，而不是单次线性任务执行器。

The key constraints are:

核心约束如下：

- task completion does not imply conversation termination
- 单个任务完成，不等于整个会话结束
- each task must go through an explicit narrowing loop
- 每个任务都必须经过显式的收敛循环
- users are not assumed to know how to prompt an LLM well
- 不能假设用户熟悉 LLM 的提问技巧
- the system must narrow intent through structured dialogue, code inspection, and explicit gates
- 系统必须通过结构化对话、代码检查和显式门禁来持续收紧用户意图

## Design Principles / 设计原则

1. The user is the final decision-maker.  
   用户是最终决策者。
2. The LLM is an execution and reasoning copilot, not the ultimate authority.  
   LLM 是执行与推理副驾驶，而不是最终权威。
3. The system provides hard gates, auditability, and recovery.  
   系统负责提供硬门禁、可审计性和恢复能力。
4. The system should ask only blocking questions.  
   系统只应该提问阻塞性问题。
5. Discovery should prefer structured code inspection over blind trial-and-error.  
   Discovery 阶段应优先使用结构化代码检查，而不是盲目试错。
6. Each completed task must archive and reset task-local context before the next task starts.  
   每个任务完成后，必须归档并重置任务级上下文，再进入下一个任务。

## Two-Layer State Model / 双层状态模型

AgentILS should maintain two connected but independent state machines:

AgentILS 应维护两个相互关联但彼此独立的状态机：

1. Conversation layer  
   会话层
2. Task layer  
   任务层

Conversation state tracks whether the overall dialogue is still active and whether a new task may start.

会话层负责管理整个对话是否仍然活跃，以及是否允许启动新任务。

Task state tracks the current task's narrowing, execution, verification, and closure loop.

任务层负责管理当前任务的收敛、执行、验证和关闭循环。

## Conversation Layer / 会话层

### States / 状态

- `active_task`
- `await_next_task`
- `conversation_blocked`
- `conversation_done`

### Meaning / 含义

- `active_task`: a task is currently being narrowed, executed, or verified  
  `active_task`：当前存在一个正在收敛、执行或验证中的任务
- `await_next_task`: the last task is closed, but the conversation remains open for another task  
  `await_next_task`：上一个任务已关闭，但会话仍保持打开，等待下一个任务
- `conversation_blocked`: the conversation cannot proceed without user intervention  
  `conversation_blocked`：当前会话在没有用户干预的情况下无法继续
- `conversation_done`: the user explicitly ended the conversation  
  `conversation_done`：用户已显式结束整个会话

### Conversation transitions / 会话状态转移

| Current / 当前 | Trigger / 触发条件 | Next / 下一状态 | Notes / 说明 |
|---|---|---|---|
| `await_next_task` | user provides a new request | `active_task` | create a new task run / 创建新任务 run |
| `active_task` | current task reaches `task_done` | `await_next_task` | archive task state, reset active task context / 归档任务状态并重置活跃任务上下文 |
| `active_task` | unrecoverable block with no valid fallback | `conversation_blocked` | conversation remains open / 会话仍保持打开 |
| `conversation_blocked` | user clarifies or overrides | `active_task` or `await_next_task` | depends on whether the blocked task resumes / 取决于被阻塞任务是否恢复 |
| `await_next_task` | user says "end", "no more", or equivalent | `conversation_done` | the only normal conversation close path / 唯一正常结束路径 |

### Conversation close rule / 会话结束规则

The system must not end the conversation only because the current task is complete.

系统不能仅仅因为当前任务完成，就结束整个会话。

Conversation termination requires explicit user intent to stop.

结束整个会话必须依赖用户的显式结束意图。

## Task Layer / 任务层

### States / 状态

- `intake`
- `discovery`
- `plan`
- `execute`
- `verify`
- `task_done`
- `task_blocked`
- `cancelled`

### Task actions / 任务动作

These are actions inside states, not top-level task states.

以下是状态内动作，而不是顶层状态：

- `ask_user`
- `inspect_code`
- `impact_scan`
- `update_plan`
- `act`
- `request_approval`
- `request_feedback`
- `request_override`

### Task state responsibilities / 任务状态职责

| State / 状态 | Owner / 责任 Agent | Purpose / 目的 |
|---|---|---|
| `intake` | `gate` | capture goal, classify clarity, decide whether discovery is required / 识别目标、判断清晰度、决定是否需要 discovery |
| `discovery` | `planner` | reduce unknowns through user questions and code inspection / 通过提问和代码检查减少未知项 |
| `plan` | `planner` | produce executable steps, assumptions, and risk framing / 生成可执行步骤、假设和风险框架 |
| `execute` | `implementer` | make changes, run checks, update task state and audit / 修改代码、执行检查、更新任务状态和审计 |
| `verify` | `reviewer` | validate result, handoff, residual risks, and completion gates / 验证结果、handoff、残余风险和完成门禁 |
| `task_done` | `reviewer` | mark the task closed and emit closure summary / 标记任务结束并输出 closure summary |
| `task_blocked` | `gate` | hold position until user clarification, approval, or override / 保持阻塞直到用户澄清、审批或 override |
| `cancelled` | `gate` | user declined or withdrew the task / 用户拒绝或撤销任务 |

## Task Transition Table / 任务状态转移表

| Current / 当前 | Trigger / 触发条件 | Next / 下一状态 | Notes / 说明 |
|---|---|---|---|
| `intake` | task is clear enough for discovery or planning | `discovery` or `plan` | simple tasks may skip most discovery / 简单任务可跳过大部分 discovery |
| `discovery` | blocking unknowns remain | `discovery` | continue `ask_user` or `inspect_code` / 继续 ask_user 或 inspect_code |
| `discovery` | enough structure exists for an executable plan | `plan` | enter planning / 进入 plan |
| `plan` | not enough information or assumptions are unstable | `discovery` | re-open discovery / 回到 discovery |
| `plan` | `can_execute = true` | `execute` | hand off to implementer / 交给 implementer |
| `execute` | local implementation issue | `execute` | fix without re-opening discovery / 局部修补，不回 discovery |
| `execute` | impact expands or assumptions collapse | `discovery` | run `impact_scan`, then re-plan / 做 impact_scan 后重新 plan |
| `execute` | implementation reaches a reviewable result | `verify` | hand off to reviewer / 交给 reviewer |
| `verify` | result passes completion gates | `task_done` | emit closure summary / 输出 closure summary |
| `verify` | fix is straightforward and local | `execute` | return to implementer / 回 implementer |
| `verify` | missing understanding or boundary conflict | `discovery` | return to narrowing loop / 回到收敛循环 |
| any active state | user cancels or declines | `cancelled` | task ends / 任务结束 |
| any active state | hard gate prevents progress | `task_blocked` | user or approval required / 需要用户或审批介入 |

## Execute Gate / 执行门

Execution readiness should use three independent checks.

执行 readiness 应由三个独立判断组成。

```ts
interface ExecuteReadiness {
  technicallyReady: boolean
  boundaryApproved: boolean
  policyAllowed: boolean
  missingInfo: string[]
  risks: string[]
}
```

Execution may begin only when all three are true:

只有以下三者全部为 true 时，才允许执行：

- `technicallyReady`
- `boundaryApproved`
- `policyAllowed`

### `technicallyReady`

`technicallyReady` should be true only when:

只有在以下条件满足时，`technicallyReady` 才能为 true：

- the goal is clear enough to implement  
  目标足够清晰，可进入实现
- the change target is mostly identified  
  改动目标已基本识别
- at least one executable step exists  
  至少存在一个可执行步骤
- there is no unresolved blocking unknown  
  不存在未解决的阻塞性未知项
- a minimal verification target exists  
  已有最小验证目标

### `boundaryApproved`

`boundaryApproved` should be true when:

以下情况 `boundaryApproved` 应为 true：

- the user already gave a clear low-risk request  
  用户已给出清晰且低风险的请求
- the user confirmed the current narrowed boundary  
  用户已确认当前收敛后的边界
- the task remains within a previously accepted boundary  
  当前任务仍处于先前已接受的边界内

`boundaryApproved` should be false when:

以下情况 `boundaryApproved` 应为 false：

- the task expands beyond original scope  
  任务范围超出原始范围
- more than one materially different solution exists  
  存在多个实质性不同方案
- risk level rises beyond the prior agreement  
  风险等级高于之前确认的范围
- the system must reinterpret the user's request in a non-obvious way  
  系统必须以非显然方式重新解释用户需求

### `policyAllowed`

`policyAllowed` should be true only when:

只有在以下条件满足时，`policyAllowed` 才能为 true：

- no hard policy block applies  
  不存在硬策略阻塞
- dangerous actions have valid approval  
  危险动作已获有效审批
- budget is not exceeded  
  未超预算
- protected targets are permitted  
  受保护路径允许访问

## Failure Classification / 失败分类

Execution and verification failures must be classified instead of being handled by a single fallback path.

执行和验证失败必须先分类，不能走统一的模糊 fallback。

| Failure type / 失败类型 | Meaning / 含义 | Preferred next action / 优先动作 | Next state / 下一状态 |
|---|---|---|---|
| `implementation_issue` | code fix is local and the plan still holds / 局部实现问题，plan 仍有效 | patch locally / 本地修补 | `execute` |
| `impact_issue` | change affects more references, modules, or flows than expected / 影响面超预期 | run `impact_scan`, then update the plan / 先 impact_scan 再改 plan | `discovery` |
| `plan_issue` | the plan itself is wrong or incomplete / plan 本身错误或不完整 | rebuild the plan / 重做 plan | `plan` or `discovery` |
| `requirement_issue` | user intent is still ambiguous or changed / 用户意图仍模糊或已改变 | ask the user to resolve the ambiguity / 回用户确认 | `discovery` |
| `policy_issue` | approval, path, or capability gate blocks action / 审批、路径或能力门禁阻塞 | request approval or block / 请求审批或进入阻塞 | `task_blocked` |
| `budget_issue` | run exceeds resource limits / 超预算 | stop and re-scope / 停止并缩小范围 | `task_blocked` |

## Structured Discovery / 结构化 Discovery

`discovery` should not default to vague exploration.

`discovery` 不应默认退化成模糊探索。

AgentILS should prefer structured narrowing:

AgentILS 应优先进行结构化收敛：

1. ask only blocking user questions  
   只问阻塞性问题
2. inspect code to confirm current implementation reality  
   通过 inspect_code 确认当前真实实现
3. use impact analysis when execution reveals hidden coupling  
   当执行暴露隐式耦合时，使用 impact analysis

### `inspect_code`

Use `inspect_code` for:

`inspect_code` 用于：

- locating relevant files  
  定位相关文件
- finding the current implementation path  
  寻找当前实现路径
- understanding local logic  
  理解局部逻辑
- confirming whether the user's technical framing is correct  
  确认用户的技术判断是否正确

### `impact_scan`

Use `impact_scan` when:

以下情况应使用 `impact_scan`：

- tests fail in a way that suggests broader coupling  
  测试失败表明存在更广的耦合
- execution touches a high-fanout file  
  执行触达高扇出文件
- refactors or schema changes may affect many consumers  
  重构或 schema 变化可能影响多个消费方
- the changed symbol is widely referenced  
  被修改符号存在大量引用

`impact_scan` should prefer:

`impact_scan` 应优先依赖：

- AST-based references  
  AST 引用分析
- language server references and definitions  
  language server 的 references / definitions
- import graph  
  import graph
- type dependency graph  
  类型依赖图
- route, config, schema, and contract linkage  
  route、config、schema、contract 的关联

The goal is to confirm the real blast radius before further implementation.

目标是在继续实现前，先确认真实影响范围。

## Override Model / Override 模型

The user remains the highest decision authority, but overrides must be explicit and auditable.

用户始终是最高决策者，但 override 必须显式且可审计。

### Override scope / Override 作用域

An override is task-scoped, not conversation-scoped.

override 仅在当前 task 内生效，不跨 conversation。

That means:

这意味着：

- an accepted override remains effective until the current task ends  
  当前 task 中，一旦接受 override，其效果持续到任务结束
- the next task does not inherit the prior task's override state  
  下一个 task 不继承上一个 task 的 override 状态
- the conversation stays open, but override authority does not leak across task boundaries  
  会话持续打开，但 override 权限不会跨任务泄漏

### Override levels / Override 分级

| Level / 级别 | Description / 描述 | Allowed / 是否允许 |
|---|---|---|
| `soft` | residual risk exists but no hard rule is violated / 存在残余风险，但未违反硬规则 | yes |
| `hard` | a major safety, approval, or completion rule is still unmet / 主要安全、审批或完成规则仍未满足 | only with elevated confirmation / 仅在更高确认级别下允许 |

### Soft override examples / 软 override 示例

- tests did not fully run  
  测试未完全执行
- reviewer reports residual non-blocking risk  
  reviewer 报告存在非阻塞风险
- handoff is useful but incomplete  
  handoff 可用但不完整
- known non-blocking issues remain  
  存在已知非阻塞问题

### Hard override examples / 硬 override 示例

- high-risk action lacks approval  
  高风险动作缺少审批
- user has not confirmed task completion  
  用户未确认任务完成
- result clearly violates a stated constraint  
  结果明显违反已声明约束
- result does not meet the task goal  
  结果不符合任务目标

### Override confirmation / Override 确认

The system must not accept a casual "ship it" or "fine for now" as a valid override.

系统不能把随意一句“就这样吧”当成有效 override。

A valid override should require an explicit acknowledgement such as:

有效 override 应要求显式确认，例如：

> I understand the current risks: `<risk list>`. I still want to continue or finish in the current state.  
> 我已理解当前风险：`<风险列表>`。我仍要求在当前状态下继续或结束。

Recommended structure:

推荐结构：

```ts
interface RiskOverride {
  confirmed: boolean
  summary: string
  acceptedRisks: string[]
  skippedChecks: string[]
  requestedBy: 'user'
  confirmedAt: string
  level: 'soft' | 'hard'
}
```

### Override effect / Override 生效后的含义

Once the user explicitly acknowledges risk for the current task, AgentILS should treat the task as operating under user-authorized execution.

一旦用户为当前 task 显式确认风险，AgentILS 应认为该任务进入“用户授权执行”状态。

After that acknowledgement:

确认后：

- the user remains the highest-priority authority for the current task  
  用户仍是当前任务的最高权威
- the LLM decides whether to keep asking, inspect code, run impact analysis, or execute directly  
  后续由 LLM 决定继续提问、inspect_code、impact_scan，还是直接执行
- the system records that the task is proceeding under accepted risk  
  系统记录该任务正处于“已知风险下推进”

Override does not mean "immediately execute".

override 不等于“立刻执行”。

It means the system may stop insisting on full normal-loop convergence before acting, because the user accepted the risk tradeoff for this task.

它的含义是：在当前 task 内，系统不再强制要求完整正常收敛后才允许动作，因为用户已经接受了风险权衡。

## Control Modes / 控制模式

AgentILS should support three control modes for each task.

AgentILS 应为每个 task 支持三种控制模式。

### `normal`

This is the default mode.

这是默认模式。

Characteristics:

特点：

- full narrowing loop is active  
  完整收敛 loop 生效
- approval, verification, and task discipline are enforced normally  
  审批、验证和任务纪律正常生效
- the system prefers explicit convergence before acting  
  系统倾向于先完成明确收敛再执行

### `alternate`

This is the degraded but still structured mode.

这是降级但仍保留结构化控制的模式。

Enter this mode when:

进入条件：

- the normal loop cannot reliably converge, and  
  正常 loop 无法可靠收敛
- the user still wants the task to proceed under acknowledged risk  
  且用户仍要求在已知风险下继续推进

Characteristics:

特点：

- AgentILS still manages the task  
  AgentILS 仍管理该任务
- the system becomes more conservative and more explicit  
  系统变得更保守、更显式
- the system must surface minimum control information before or alongside execution  
  系统必须在执行前或执行时给出最低限度控制信息

Minimum outputs in `alternate`:

在 `alternate` 中必须输出：

- current assumptions  
  当前假设
- current unverified items  
  当前未验证项
- suggested manual check points  
  建议人工检查点

Behavior changes in `alternate`:

`alternate` 中的行为变化：

- prefer `inspect_code` and `impact_scan` over heuristic guessing  
  优先使用 `inspect_code` 和 `impact_scan`，少做启发式猜测
- reduce automatic step size  
  缩小自动执行步长
- avoid large silent scope expansion  
  避免静默扩大范围
- keep override status visible in task state and final summary  
  在 task state 和最终 summary 中显式保留 override 状态

### `direct`

This is the least-controlled mode.

这是控制最弱的模式。

Enter this mode when:

进入条件：

- the user explicitly chooses to bypass most AgentILS control logic, or  
  用户显式选择绕过大部分 AgentILS 控制逻辑
- repeated overrides make the task effectively equivalent to direct LLM interaction  
  或连续 override 使任务在效果上等同于直接与 LLM 对话

Characteristics:

特点：

- this is close to direct user-to-LLM interaction  
  这已经接近用户直接与 LLM 对话
- most strong loop control is no longer enforced  
  大多数强 loop 控制不再生效
- AgentILS should still provide the thinnest useful layer of visibility and audit  
  AgentILS 仍应保留最薄的一层可见性与审计

Minimum retained behavior in `direct`:

`direct` 中最低限度保留的行为：

- mark the task as running in direct mode  
  标记任务处于 direct mode
- keep the accepted risk record  
  保留已接受风险记录
- emit minimal visible context such as assumptions, major risks, and suggested checks when possible  
  尽量输出最小可见信息，如假设、主要风险、建议检查点
- record direct-mode completion in the task summary  
  在 task summary 中记录该任务以 direct mode 完成

### Mode progression / 模式推进关系

Recommended progression:

推荐推进方向：

- `normal -> alternate -> direct`

This progression is monotonic within a task unless the user explicitly restarts the task under normal conditions.

在单个 task 内，这种模式切换默认是单向的，除非用户显式重启任务并回到正常条件。

The system should not silently promote itself back from `direct` to `normal`.

系统不应静默地从 `direct` 自动恢复到 `normal`。

## Repeated Override Handling / 连续 Override 处理

Repeated override is not just a warning condition. It is a control-mode transition signal.

连续 override 不只是警告信号，它还是控制模式切换信号。

### Escalation rule / 升级规则

| Current mode / 当前模式 | Trigger / 触发条件 | Next mode / 下一模式 |
|---|---|---|
| `normal` | user override accepted because normal loop cannot fully converge | `alternate` |
| `alternate` | user keeps overriding while asking AgentILS to continue | `alternate` or `direct` |
| `direct` | further overrides | remain `direct` |

### User-facing guidance / 面向用户的提示

When repeated overrides occur, AgentILS should warn the user that result quality may degrade.

发生连续 override 时，AgentILS 应明确提示用户结果质量可能下降。

Recommended message shape:

推荐提示格式：

> You have overridden normal task controls multiple times. Result quality, verification coverage, and scope accuracy may be reduced. Please manually check: `<check list>`.  
> 你已多次绕过正常任务控制。结果质量、验证覆盖度和范围准确性可能下降。请重点人工检查：`<检查项列表>`。

### System behavior in repeated override / 连续 Override 时的系统行为

The system should not only display a warning.

系统不能只弹一句警告。

It should also:

还应当：

- force assumptions to be visible  
  强制展示当前假设
- force unverified items to be visible  
  强制展示未验证项
- force suggested manual checks to be visible  
  强制展示建议人工检查点
- record that the task operated in degraded control  
  记录任务处于降级控制模式
- include override details in the generated task summary  
  在任务总结中写入 override 细节

## Completion Model / 完成模型

Task completion and conversation termination are different concepts.

任务完成与会话结束是两个不同概念。

### `task_done`

The task may be marked done only when:

只有在以下条件满足时，任务才能被标记为 `task_done`：

- the user confirmed the task is done  
  用户确认任务已完成
- verification passed, or an auditable override was accepted  
  验证通过，或已接受带审计记录的 override
- handoff is complete enough for future resume  
  handoff 足够支持未来恢复理解
- there are no unresolved hard blocks  
  不存在未解决的硬阻塞

### `conversation_done`

The conversation may be marked done only when:

只有在以下条件满足时，会话才能被标记为 `conversation_done`：

- there is no active task  
  当前没有 active task
- the conversation is in `await_next_task`  
  conversation 处于 `await_next_task`
- the user explicitly ends the conversation  
  用户显式结束会话

## Task Summary Document / 任务总结文档

Each completed task must generate a task summary document on disk.

每个完成的任务都必须在磁盘上生成一份 task summary 文档。

This summary is the only default memory artifact that the next task should inherit.

这份 summary 是下一个 task 默认继承的唯一记忆工件。

### Summary document rules / 总结文档规则

- the system always writes a summary document when a task ends  
  每个 task 结束时，系统总是写出 summary 文档
- the document is user-visible and editable  
  文档对用户可见且可编辑
- the system should notify the user that the summary was generated  
  系统应提醒用户 summary 已生成
- the summary becomes effective by default even if the user does not edit it  
  即使用户不编辑，summary 也默认生效
- if the user edits the summary, the edited file becomes the effective inherited summary  
  如果用户修改 summary，则修改后的版本成为后续继承版本
- starting the next task always requires an explicit user action  
  启动下一个 task 始终需要用户显式动作

### Why this exists / 为什么需要它

This keeps carry-forward memory abstract and stable:

这样可以让跨任务继承记忆保持抽象且稳定：

- inherit the high-level outcome  
  继承高层结果
- do not inherit the full transcript  
  不继承完整对话 transcript
- do not inherit low-level reasoning debris  
  不继承底层推理残渣

This follows the principle:

这遵循以下原则：

- carry forward summary, not transcript  
  继承 summary，而不是 transcript

### Summary document content / 总结文档内容

Recommended contents:

推荐内容：

- task title  
  任务标题
- outcome summary  
  结果摘要
- key files changed  
  关键修改文件
- residual risks  
  残余风险
- accepted overrides  
  已接受 override
- important user-confirmed constraints  
  用户确认过的重要约束
- any state that the next task should know as a high-level fact  
  下一个 task 应知道的高层事实

### User flow after task completion / 任务完成后的用户流程

1. task reaches `task_done`  
   task 达到 `task_done`
2. AgentILS writes the summary document  
   AgentILS 写出 summary 文档
3. AgentILS tells the user the summary exists  
   AgentILS 告知用户 summary 已生成
4. if the user wants changes, the user edits the summary document  
   如果用户需要修改，则手动编辑 summary 文档
5. the next task starts only when the user explicitly triggers `New task`  
   只有当用户显式触发 `New task` 时，下一个 task 才开始

AgentILS should not attempt to auto-detect that editing is complete and should not automatically start the next task.

AgentILS 不应尝试自动检测用户是否编辑完成，也不应自动启动下一个 task。

## Context Cleanup / 上下文清理

Task completion should trigger task-level cleanup, not full conversation reset.

任务完成应触发任务级上下文清理，而不是整个 conversation 的完全重置。

### Keep across tasks / 跨任务保留

- user preferences  
  用户偏好
- workspace or repository facts  
  workspace 或 repository 事实
- global safety and policy context  
  全局安全与策略上下文
- archived summaries of prior completed tasks  
  已归档的历史任务摘要

### Archive and deactivate after each task / 每个任务后归档并失活

- task goal  
  任务目标
- narrowed boundary  
  收敛后的边界
- open questions  
  open questions
- assumptions  
  assumptions
- plan steps  
  plan steps
- touched files  
  touched files
- verification state  
  verification state
- overrides  
  overrides

### Drop from active context / 从活跃上下文中移除

- temporary local reasoning  
  临时局部推理
- intermediate code scan fragments  
  中间态代码扫描片段
- task-specific assumptions that should not leak into the next task  
  不应泄漏到下一任务的任务特定假设

### Required closeout actions / 必须执行的收尾动作

When a task reaches `task_done`, AgentILS should:

当 task 到达 `task_done` 时，AgentILS 应执行：

1. emit a `TaskClosureSummary`  
   输出 `TaskClosureSummary`
2. archive `taskCard` and `handoffPacket`  
   归档 `taskCard` 和 `handoffPacket`
3. clear the active task slot  
   清空 active task 槽位
4. transition the conversation to `await_next_task`  
   将 conversation 切到 `await_next_task`
5. write the user-visible task summary document  
   写出用户可见的任务总结文档

Recommended summary shape:

推荐结构：

```ts
interface TaskClosureSummary {
  taskId: string
  title: string
  outcome: string
  touchedFiles: string[]
  residualRisks: string[]
  userOverrides: string[]
}
```

## Dialogue Narrowing Strategy / 对话收敛策略

AgentILS should be designed for users who do not fully understand how to steer an LLM.

AgentILS 必须面向“不完全懂如何驱动 LLM”的用户来设计。

The system should therefore optimize for progressive narrowing rather than prompt literacy.

因此系统应优化“渐进式收敛”，而不是依赖用户的 prompt 能力。

| User pattern / 用户表达模式 | System response / 系统响应 |
|---|---|
| only gives a vague goal | propose candidate interpretations and ask the smallest blocking question / 提供候选理解并问最小阻塞问题 |
| uses an incorrect technical framing | inspect code first, then restate the problem in implementation terms / 先 inspect_code，再用实现语言重述问题 |
| answers only part of a question set | continue if the missing information is non-blocking, otherwise re-ask only the blocking part / 若缺失信息非阻塞则继续，否则只追问阻塞部分 |
| gives contradictory instructions | surface the contradiction explicitly and ask which boundary should win / 显式指出冲突并要求确认有效边界 |
| changes direction mid-task | treat it as re-intake and rebuild the task boundary / 按 re-intake 处理并重建任务边界 |
| says "use reasonable judgment" | continue with explicit assumptions, then re-confirm at risk boundaries / 带显式 assumptions 推进，并在风险边界重新确认 |

The system should prefer constrained questions over broad open-ended prompts.

系统应优先使用收敛型问题，而不是宽泛开放式提问。

## Compound User Requests / 复合用户请求

Compound requests should default to a single task with multiple steps, not multiple tasks.

复合输入默认应拆成“一个 task 下的多个 steps”，而不是多个 task。

Examples:

例如：

- investigate and fix  
  先定位再修复
- implement and document  
  先实现再补文档
- scan first and then patch  
  先扫描再修补

### Default rule / 默认规则

When the user gives one composite objective, AgentILS should:

当用户给出一个复合目标时，AgentILS 应：

- create one task  
  创建一个 task
- express the composite structure as ordered steps  
  把复合结构表达为有序 steps

### Exception rule / 例外规则

Only split into separate tasks when a sub-goal is independently deliverable and independently closable.

只有当子目标具备独立交付与独立关闭条件时，才拆成多个 task。

If a sub-goal can be completed, reviewed, and archived on its own, then it may deserve a separate task.

如果某个子目标能独立完成、独立评审、独立归档，则它可以被拆成单独 task。

## Custom Agent Roles / 自定义 Agent 角色

### `gate`

- owns `intake`  
  负责 `intake`
- decides whether execution is allowed to begin  
  决定是否允许进入执行
- triggers approval, feedback, and override requests  
  触发 approval、feedback 和 override 请求
- controls entry to and exit from blocked states  
  控制 blocked 状态的进入与退出

### `planner`

- owns `discovery` and `plan`  
  负责 `discovery` 和 `plan`
- updates `taskCard`  
  更新 `taskCard`
- tracks assumptions, open questions, and execution readiness  
  跟踪 assumptions、open questions 和 execution readiness
- performs `inspect_code` and `impact_scan`  
  执行 `inspect_code` 和 `impact_scan`

### `implementer`

- owns `execute`  
  负责 `execute`
- updates touched files and step progress  
  更新 touched files 和 step progress
- records audit and local verification data  
  记录 audit 和本地验证数据
- reports when execution should fall back to discovery  
  当执行应回退到 discovery 时负责上报

### `reviewer`

- owns `verify`  
  负责 `verify`
- determines whether the task can be closed  
  决定任务是否允许关闭
- classifies residual risk  
  分类残余风险
- decides whether a fix returns to `execute` or `discovery`  
  决定修补应回到 `execute` 还是 `discovery`

## Suggested State Additions / 建议新增的状态结构

### Conversation record / 会话记录

```ts
interface ConversationRecord {
  conversationId: string
  state: 'active_task' | 'await_next_task' | 'conversation_blocked' | 'conversation_done'
  activeTaskId: string | null
  completedTaskIds: string[]
  archivedTaskSummaries: TaskClosureSummary[]
}
```

### Task card extensions / TaskCard 扩展

```ts
interface TaskCardExtensions {
  openQuestions: string[]
  assumptions: string[]
  conflicts: string[]
  decisionNeededFromUser: string[]
  executionReadiness: ExecuteReadiness
  lastDiscoverySummary: string
  lastPlanSummary: string
}
```

### Handoff extensions / Handoff 扩展

```ts
interface HandoffExtensions {
  blockingUnknowns: string[]
  whyReturnedToDiscovery?: string
  lastFailedAttempt?: string
  recommendedNextQuestion?: string
  recommendedNextAgent?: 'gate' | 'planner' | 'implementer' | 'reviewer'
}
```

## Open Decisions / 待拍板事项

The following items still require final product decisions before implementation:

以下事项在编码前仍需最终拍板：

1. minimum required `impact_scan` capability for MVP  
   MVP 最低要求的 `impact_scan` 能力集
2. whether medium-risk tasks always require boundary confirmation  
   中风险任务是否一律要求边界确认
3. whether hard overrides are allowed in all hosts or only in trusted environments  
   硬 override 是否允许在所有宿主中生效，还是仅在可信环境中允许
4. how conversation-level state should be persisted and resumed across sessions  
   conversation 级状态如何跨 session 持久化与恢复
5. how much of the conversation archive should be surfaced back into the active LLM context  
   conversation 归档内容应有多少重新暴露给活跃 LLM 上下文

