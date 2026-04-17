# Technical Changelog

## 2026-04-16

### 跨 IDE 状态机架构决策记录

基于内测用户反馈的关键架构决策：

#### IDE 支持矩阵变更

- **移除 Windsurf**：不支持 MCP Elicitation，核心交互均需降级，用户体验差。
- **新增 Codex (OpenAI)**：支持 Resources, Tools, **Elicitation**（路由到 TUI 用户输入）。联网验证来源：modelcontextprotocol.io + developers.openai.com。
- **新增 Google Antigravity**：Google agent-first IDE，基于 Gemini 3.1 Pro。支持 MCP Tools + Resources。**Elicitation 支持未确认**（官方 MCP 文档仅提及 Tools 和 Resources）。标记为高优先级待验证项。
- 最终支持矩阵：VS Code (full) / Cursor (Elicitation ✅) / Codex (Elicitation ✅) / Antigravity (Elicitation ❓)

#### `clarification_request` 工具设计（P3 → P0）

- 从 v1.0 的 "P3 未来改进" 提升为 **P0 核心工具**。
- 在 `collect` 阶段使用，支持 text + image 输入（WebView 粘贴图片）。
- 接口设计：`questions` 数组 → flat JSON Schema → MCP elicitation → 结构化返回。
- VS Code 侧通过 VSIX WebView 渲染富表单；Cursor/Codex 用原生 elicitation；Antigravity 待验证。

#### 会话-任务架构规则

- **1 会话 : N 顺序任务**：一个 conversation 可包含多个 task，必须顺序执行。
- **LLM 禁止自主结束会话**：`conversation_end` 仅接受用户显式调用。VS Code 环境中，LLM 完成任何操作后必须弹出 WebView 询问用户下一步。
- **任务放弃路径**：显式调用 `new_task_request` 开始新任务（隐式放弃当前任务）。
- **充分性判断**：技术可行性 + 产品逻辑正确性同时满足才可推进阶段。

#### Elicitation 降级策略

- `ctx.elicitUser()` 增加 try/catch，不支持时返回 `{ action: 'unsupported' }`。
- 新增 `approval_submit` / `feedback_submit` 工具作为手动降级路径。
- System Prompt 按 IDE 差异化：支持 elicitation 的 IDE 使用自动弹窗版本，不支持的使用多轮 Chat 指导版本。

---

## 2026-04-15

### 控制法则三模式设计溯源：致敬 Airbus 电传飞控架构

AgentILS 的三种控制模式（`normal` / `alternate` / `direct`）在命名和语义上有意参考了 Airbus 电传飞控（Fly-By-Wire, FBW）系统中的三种控制法则（Flight Control Laws）。

#### Airbus 飞控三法则回顾

在 Airbus A320/A330/A340 等 FBW 机型中，控制法则定义了"侧杆输入 → 飞控计算机 → 舵面响应 → 飞机运动"的完整映射关系：

| 控制法则 | 英文 | 语义 |
|---|---|---|
| 正常法则 | Normal Law | 全功能模式：侧杆输入转化为目标姿态指令，飞控系统自动提供全套飞行包线保护（失速/超速/过载/坡度限制等），飞行员感知"意图到动作"的直接对应 |
| 备用法则 | Alternate Law | 故障降级模式：部分飞控增稳功能保留，包线保护部分丧失（如高速保护消失），飞行员需更多主动管理；分为"带低速稳定性"和"不带低速稳定性"两个子级 |
| 直接法则 | Direct Law | 进一步退化：侧杆输入直接对应舵面偏转，无增稳、无保护、接近传统机械操纵；飞行员需完全自主承担姿态、速度、边界管理 |

参考资料：[Flight Control Laws — SKYbrary](https://skybrary.aero/articles/flight-control-laws)

#### AgentILS 控制模式的类比映射

| Airbus 法则 | AgentILS 控制模式 | 语义映射 |
|---|---|---|
| Normal Law | `normal` | LLM 指令经完整控制平面处理：门禁全量生效，missingInfo 阻断执行，必须经过 approval/feedback 工具，系统提供完整需求收窄保护 |
| Alternate Law | `alternate` | 首次 override 后的降级：用户已接受部分风险（`boundaryApproved` 被绕过），但仍需通过 `approval_request` 进行明确确认；系统保留部分门禁 |
| Direct Law | `direct` | 二次/高风险 override 后的深度降级：LLM 与用户直接对话，不经过控制平面门禁工具；用户需完全自主管理任务边界和风险判断 |

#### 设计意图

这个类比不只是命名上的致敬，而是在架构语义上的对齐：

- **正常运行时**，控制平面是 AI Agent 的"飞控计算机"——它将 LLM 的自然语言意图转化为结构化、可审计、有保护的操作序列。
- **当用户主动 override 时**，系统降级但不停止——类似飞行员在备用/直接法则下仍可完成任务，但需要更多主观判断和主动管理。
- **降级是任务作用域的**——每个新任务重新从 `normal` 法则开始，不继承上一任务的降级状态。这对应飞机在安全着陆、故障排除后系统复位的设计哲学。

#### 关键约束提醒（LLM 侧）

- 在 `direct` 模式下，控制平面不介入当前 task——LLM 读取 `control-mode` 资源后自行决策，不调用 `approval_request` / `feedback_gate`
- 降级路径：normal → alternate → direct（不自动回升）
- `direct` 模式内 override 清除不等于模式回升；模式回升仅通过 `recovery` 信号触发（当前无自动触发场景）

---

## 2026-04-14


经过对现有实现的复核，我们决定把架构方向从“全面 class 深绑定”调整为“保留主体 class 结构，只在请求链路上引入部分 `ctx`”。

原因很直接。当前问题不在于 class 本身，而在于有些能力天然属于一次请求，却被挂在了全局对象上。最典型的是交互入口直接走 `server.server.elicitInput(...)`，以及 `conversation_done` 在不同层各自推导，导致状态不一致。

从状态管理角度看，这次调整也明确把类似 React 的单向数据流思路提升为硬约束：状态写入可以有多个命令入口，但派生状态不能在多个模块里各自再算一遍。否则 store、orchestrator、hook、UI、script 会逐步演变成多向状态解释结构，维护成本会迅速放大。

同时，我们把开发流程也收紧为“测试先行、结构先行、实现后置”。也就是说，后续改动应先定义模块边界、输入输出合同和测试断言，再进入实现阶段。

所以这次不是推翻现有 OOD 结构，而是把边界重新划清：

- `store`、`audit`、`summary`、`policy`、`orchestrator` 继续保持 class/service 形式
- `runId`、`conversationId`、`taskId`、`traceId`、`elicitUser`、`interactionAllowed` 这类只在当前请求里有效的信息，改为通过 `ctx` 显式传递

这样做的好处是：

- 不需要把现有编排层整体推倒重来
- 请求级能力有了明确作用域，后续更容易处理并发和长链路交互
- 会话状态可以收敛到一套真值来源，减少 UI、hook、runtime 之间的分叉
- 改造范围更集中，优先解决真正的问题，而不是为了形式统一去重写整套结构
- 更接近单向数据流模型，后续定位问题时可以先找唯一真值源，再向外追调用链
- 先有测试和结构约束，后续实现更容易保持边界稳定，不会越写越散

本条记录只反映架构决策变化，不代表相关代码已经全部完成迁移。
