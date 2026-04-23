# AgentILS Stage Envelope 字段契约（必读）

> 给 LLM 用户：当 AgentILS 在 `run_task_loop` 中提示你为某个 phase 产出 reply 时，
> body 必须严格符合下表，否则 webview 渲染失真、TCAS 检测失效、ECAM 法则降级失常。
>
> 真值源: docs/agentils/webview-source-of-truth-cascade-plan.md §1.2.2 / §4.2

## 字段契约表

| Phase | 必填字段 | 选填字段 |
|---|---|---|
| collect (A) · 收集需求 | `assistantReply` | `recordedInput` `clarifyingQuestions[]` `missingPoints[]` |
| plan (B) · 规划方案 | `assistantReply` `planSteps[≥1]` | `risks[]` `missingPoints[]` `conflicts[]` `riskLevel` `confirmPrompt` |
| execute (C) · 执行 | `assistantReply` `artifacts[≥1]` | `risks[]` `riskLevel` `confirmPrompt` |
| test (D) · 回归验证 | `assistantReply` `testsPassed` `testsTotal` | `uncovered[]` `risks[]` |
| summarize (E) · 总结 | `assistantReply` `taskTitle` `finalKeyPoints[≥1]` `verifyConclusion` | — |

## TCAS 风险评估（B 阶段独有）

`conflicts[]` 仅在 planSteps 之间发现**客观冲突**时填，不要把"信息不足"或主观推测填到这里。

每条冲突结构:
- `kind`: `'time' | 'resource' | 'irreversible' | 'logic'`
- `description`: 一句话描述客观冲突
- `involves`: 涉及的步骤标识（如 `['步骤2', '步骤4']`）

例:
```json
{
  "kind": "time",
  "description": "18:00-19:30 餐厅就餐 与 19:00 朋友约会 重叠 30 分钟",
  "involves": ["步骤2", "步骤4"]
}
```

**反例（禁止）**:
- 把"用户没说预算"填为 conflict（应填 `missingPoints`）
- 把"晚上活动可能影响第二天精神"填为 conflict（这是主观推测，最多写到 `risks`）

## ECAM 法则状态约束

- 你（LLM）**不能**直接设置 `controlMode`；只能通过填 `conflicts[]` 让 AgentILS 提示用户确认是否降级
- AgentILS 在 normal → alternate → direct 之间**只单向降级**，不会自动回升
- 进入 `direct` 模式后，你无需填这些结构化字段，可直接用 `assistantReply` 自由对话

## 禁止项

- ❌ 在 `collect (A)` 阶段使用 `risks[]`（那是 plan/execute 才有的语义）
- ❌ `planSteps` / `artifacts` / `finalKeyPoints` 为空数组
- ❌ `assistantReply` 退化为反问（"请问你想要什么"）；必须给出实质内容；信息不足请走 `missingPoints[]`
- ❌ 同一 phase 反复填同样的字段（应该按推进推动 phase 转移）

## 与 run_task_loop 的协同

每次调用 MCP 工具 `agentils/run_task_loop` 后，根据返回值的 `next.action` 字段决定行为：

- `next.action='await_webview'`：你下一次产出的 reply 必须严格按本契约填字段；可用 `agentils/state_get` 查询当前任务的 phase 与 controlMode，确认应填的 phase 段
- `next.action='recall_tool'`：立刻再次调用 `agentils/run_task_loop`，无需自填字段
- `next.action='return_control'`：任务终态，不再产出 stage 字段
