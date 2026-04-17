# AgentILS 任务执行管线改造计划

版本：v1.0  
日期：2026-04-16  
状态：规划中

---

## 0. 改造目标

将 AgentILS 的任务执行管线从 5 步扩展为 7 步，在关键节点增加显式门禁，使得执行前有审批、执行后有交接准备，形成完整的"收敛 → 审批 → 执行 → 交接 → 验证"闭环。

### 旧管线（5 步）

```
collect → confirm_elements → plan → execute → verify
```

### 新管线（7 步）

```
collect → confirm_elements → plan → approval → execute → handoff_prepare → verify
```

**新增的两个阶段：**

| 阶段 | 位置 | 职责 |
|---|---|---|
| `approval`（执行审批）| plan → execute 之间 | 方案确认后、动手改代码之前的显式审批门禁。normal/alternate 模式下必须通过，direct 模式下跳过。 |
| `handoff_prepare`（交接准备）| execute → verify 之间 | 执行完成后、进入验证之前的交接准备阶段。整理变更内容、影响面、需要人工检查的点，为后续 verify 或人工接手提供结构化交接物。 |

---

## 1. 为什么要改

### 1.1 approval 的必要性

原管线中 plan 通过后直接进入 execute，缺少一个显式的"可以开始改了吗？"确认点。在以下场景中会出问题：

- 方案看起来可行，但用户还想再看一眼才动手
- 多人协作场景中，执行权限需要上级确认
- alternate 模式下，系统需要在执行前暴露当前未验证假设

approval 是一个**可跳过的门禁**：
- normal 模式：审批通过后执行
- alternate 模式：审批通过后执行，但审批内容中必须包含风险暴露
- direct 模式：用户已接管决策权，跳过审批直接执行

### 1.2 handoff_prepare 的必要性

原管线中 execute 完成后直接进入 verify，缺少一个整理交接物的阶段。这导致：

- verify 阶段拿到的信息不完整，不知道改了什么、影响了哪里
- 如果任务需要人工接手（比如需要手动测试），没有结构化的交接物
- summary 文档的写入时机不明确

handoff_prepare 负责：
- 整理本次执行的变更清单
- 标注影响面和需要人工检查的点
- 为 verify 或人工接手准备结构化交接内容
- 写入 handoff packet

---

## 2. 6 个典型场景

改造后的管线支持 6 种典型任务执行路径，每种路径对应不同的复杂度和回退模式：

### 2.1 简单直通（Simple Pass）

```
collect → confirm_elements → plan → approval → execute
```

最简路径。需求清晰、方案稳定、审批通过后直接执行。不涉及 handoff_prepare 和 verify（任务简单到不需要验证）。

### 2.2 方案收敛循环（Plan Convergence Loop）

```
collect → confirm_elements → plan → approval → execute
                ↑                       |
                └───────────────────────┘
                 方案被否决 / 信息不稳定
```

方案不够稳定或被用户否决时，从 approval/plan 回退到 confirm_elements 重新收敛。这是最常见的循环模式。

### 2.3 执行回退循环（Execute Rollback Loop）

```
collect → confirm_elements → plan → approval → execute
                ↑               |                  |
                ├───────────────┘                  |
                │  原方案不成立                      |
                └──────────────────────────────────┘
                   执行中发现新影响面
```

两层回退：plan 阶段发现方案不成立可以回退；execute 阶段发现新问题也可以长弧回退到 confirm_elements。

### 2.4 验证回退循环（Verify Rollback Loop）

```
collect → confirm_elements → plan → approval → execute → handoff_prepare → verify
                ↑               |                                            |
                ├───────────────┘                                            |
                │  方案被否决                                                 |
                │                          ↑                                 |
                │                          └─────────────────────────────────┘
                │                            验证失败 / 需要重新规划
```

唯一展示完整 7 步的场景。验证失败时回退到 plan 重新规划。

### 2.5 备用法则（Alternate Mode）

```
collect → confirm_elements → plan → [正常法则无法收敛]
                                         ↓
                                    用户明确继续
                                         ↓
                                      风险确认
                                         ↓
                                    alternate 法则
                                         ↓
                                      approval → execute
```

正常法则收敛失败 → 用户确认风险 → 进入 alternate 模式。alternate 模式下仍需通过 approval。

### 2.6 直接法则（Direct Mode）

```
collect → confirm_elements → plan → [正常法则无法收敛]
                                         ↓
                                    用户明确继续
                                         ↓
                                     强风险确认
                                         ↓
                                     direct 法则
                                         ↓
                                      execute（跳过 approval）
```

用户完全接管决策权 → 跳过 approval → 直接执行。系统只保留最小审计。

---

## 3. 控制法则与 approval 的关系

| 控制法则 | approval 行为 | 说明 |
|---|---|---|
| normal | 必须通过 | 标准审批流程 |
| alternate | 必须通过，且审批内容包含风险暴露 | 系统保留基础控制 |
| direct | 跳过 | 用户已接管决策，approval 无意义 |

---

## 4. 对现有代码的影响范围

### 4.1 类型层（src/types/）

- `task.ts`：TaskPhase / step 枚举需要新增 `approval` 和 `handoff_prepare`

### 4.2 状态机（src/store/）

- step 推进逻辑需要识别新的阶段转换路径

### 4.3 Orchestrator 层

- `task-orchestrator.ts`：step 推进需要新增 approval → execute 和 execute → handoff_prepare 的转换
- 可能需要新增 approval orchestrator 或将审批逻辑集成到 control-mode-orchestrator

### 4.4 Gateway 层

- `tools.ts`：可能需要新增 approval 相关工具，或在现有 `taskcard_put` 中扩展
- `resources.ts`：approval 状态可能需要暴露为资源

### 4.5 可视化文档

- `docs/agentils/flowcharts/ch4/task-flows.html`：已完成（本次创建）

---

## 5. 决策记录

| 决策项 | 结论 |
|---|---|
| handoff_prepare 触发方式 | 自动流转。execute 完成后系统自动推进到 handoff_prepare，无需用户操作。 |
| approvalPassed 门禁 | 在 `evaluateTaskExecutionGate()` 中新增 `approvalPassed` 检查项。 |
| 开发方式 | 测试先行。每个变更点先写测试断言，再修改实现。 |
| approval 降级链路 | WebView modal.confirm → MCP elicitation → 纯文本确认（三层降级） |
| verify 回退粒度 | verify 失败 → plan（系统自动），用户补充信息时 → confirm_elements（LLM 隐式触发） |

---

## 6. 实现阶段（测试先行）

### Phase 1 — 类型扩展

- `src/types/task.ts`：`HandoffPacket` 新增 `changeSummary`/`impactScope`/`manualCheckpoints`；`RunRecord`/`TaskCard` 新增 `approvalPassed`

### Phase 2 — 门禁强化

- `src/control/gate-evaluators.ts`：`evaluateTaskExecutionGate()` 新增 `approvalPassed` 检查（direct 模式自动通过）
- 测试先行：`test/control/gate-evaluators.test.ts`

### Phase 3 — Step 推进拦截

- `src/orchestrator/task-orchestrator.ts`：plan→execute 拦截为 plan→approval（非 direct 模式），execute→verify 自动插入 handoff_prepare
- 测试先行：`test/orchestrator/task-orchestrator.test.ts`

### Phase 4 — handoff_prepare 自动流转

- 新建 `src/orchestrator/handoff-orchestrator.ts`：收集交接物、写入 HandoffPacket、自动推进到 verify
- 测试先行

### Phase 5 — approval 控制法则感知

- `src/orchestrator/control-mode-orchestrator.ts`：alternate 附加 risks、recordApproval 设置 approvalPassed、direct 自动跳过
- 测试先行：`test/orchestrator/control-mode-orchestrator.test.ts`

### Phase 6 — 回退路径验证

- 验证现有 verify→plan 回退、plan→confirm_elements 回退路径在新流程下正确工作
- 测试先行

### Phase 7 — VS Code WebView approval 弹窗

- `extensions/agentils-vscode/src/panel/task-console-renderer.ts`：将 approval 从 inline form 改为 modal.confirm overlay
- `extensions/agentils-vscode/src/panel/task-console-protocol.ts`：`PanelApprovalInteractionInfo` 扩展 `risks` 字段
- normal 模式：方案摘要 + [确认执行] / [返回修改]
- alternate 模式：同上 + ⚠️ 风险暴露区 + [我已知晓风险，确认执行]
- 降级链路：WebView modal → MCP elicitation → 纯文本确认
