# 03 — `run_task_loop` 决策树

每次 `run_task_loop` 调用返回 `RunTaskLoopResult`，其中 `next.action` 决定 caller 怎么继续。

```mermaid
flowchart TD
  Call["caller 调用 run_task_loop({ directive, interactionResult? })"]
  Call --> Apply["orchestrator 应用 directive 到 memory-store<br/>更新 phase / interaction / terminal"]
  Apply --> Push["fanout 给所有 ResourceNotifier<br/>(state://current, state://{taskId}, ...)"]
  Push --> Decide{"next.action ?"}

  Decide -->|recall_tool| Recall["立即再调一次 run_task_loop<br/>(无人参与的中间步骤)"]
  Decide -->|await_webview| Await["保持 tool 调用挂起<br/>等 WebView/用户提交<br/>(elicitation 期)"]
  Decide -->|return_control| Return["任务到达终态<br/>caller 返回控制权给用户"]

  Recall --> Call
  Await -. "用户提交 → caller 收到 elicitation result" .-> Call
  Return --> End["✅ 任务结束<br/>(completed/failed/abandoned)"]
```

## 三种 action 的语义

| action | 语义 | 典型出现 |
|--------|------|---------|
| `recall_tool` | 中间状态没有人类阻塞，立即推进下一步 | `noop` 后还有未消化的 directive、`draft_plan` 完成接 `execute` |
| `await_webview` | 触发了 `request_clarification`，等用户回 elicitation | collect/plan/execute 中需要澄清 |
| `return_control` | task terminal | `finish` 或者其它逻辑导致 terminal |

## caller 的标准应对

```ts
let result = await runTaskLoop(initial)
while (result.next.action === 'recall_tool') {
  result = await runTaskLoop({ taskId: result.task.taskId })
}
if (result.next.action === 'await_webview') {
  // 等用户提交
} else if (result.next.action === 'return_control') {
  // 任务结束，呈现 summary
}
```

实际 caller 实现见 `extensions/agentils-vscode/src/runtime-client.ts` 与 `webview-host.ts` 联动。
