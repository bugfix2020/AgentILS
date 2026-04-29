# 05 — ResourceNotifier per-client 推送

每个 HTTP client 连接独立注册 `ResourceNotifier` 到 `orchestrator.notifiers: Set`，断开自动 dispose。

```mermaid
sequenceDiagram
  autonumber
  participant C1 as Client A (Copilot)
  participant C2 as Client B (Extension WebView)
  participant T1 as HTTP Transport A
  participant T2 as HTTP Transport B
  participant O as Orchestrator
  participant S as memory-store

  C1->>T1: connect (POST + SSE)
  T1->>O: addNotifier(notifierA)
  O-->>T1: { dispose }
  Note right of T1: T1.runtime.disposeNotifier = dispose

  C2->>T2: connect (POST + SSE)
  T2->>O: addNotifier(notifierB)
  O-->>T2: { dispose }

  Note over O: notifiers: Set { notifierA, notifierB }

  C1->>T1: tool call run_task_loop
  T1->>O: orchestrator.runTaskLoop()
  O->>S: 写 task / interaction
  O->>O: fanout(n => n.notifyTask(taskId))
  O->>T1: notifierA.notifyTask
  O->>T2: notifierB.notifyTask
  T1-->>C1: SSE: notifications/resources/updated state://current
  T2-->>C2: SSE: notifications/resources/updated state://current

  C1->>T1: state_get → 最新快照
  C2->>T2: state_get → 最新快照

  C2->>T2: disconnect
  T2->>O: runtime.disposeNotifier()
  Note over O: notifiers: Set { notifierA }
```

## 关键代码

- `packages/mcp/src/gateway/server.ts` — 创建 runtime + 注册 notifier
- `packages/mcp/src/orchestrator/orchestrator.ts`
  - `addNotifier(notifier): { dispose }`
  - `private fanout(fn)` — 遍历 notifiers 执行
- `packages/mcp/src/gateway/transports.ts` — `transport.onclose` → `runtime.disposeNotifier`

## 与旧 `setNotifier()` 的差异

旧 V1 之前用单值字段 `runtime.notifier`，多客户端会互相覆盖（最后连接的赢）。**新代码必须用 `addNotifier()`**；`setNotifier()` 仅向后兼容，文档不应再演示。
