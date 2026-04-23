# 04 — HTTP MCP 启动 + lock 协调

```mermaid
sequenceDiagram
  autonumber
  participant Caller as node packages/mcp/dist/index.js
  participant Lock as ~/.agentils/runtime-{hash}.lock
  participant Port as OS port pool
  participant App as Express + StreamableHTTP

  Caller->>Lock: 读取
  alt 文件存在
    Lock-->>Caller: { pid, host, port, url }
    Caller->>Caller: process.kill(pid, 0) 探测
    alt PID 存活
      Caller-->>Caller: 打印 url 退出（保证单 server）
    else PID 不存在
      Caller->>Lock: 删除残留
    end
  end

  Caller->>Port: pickFreePort(preferred=8788)
  Port-->>Caller: port = 8788 (或 fallback)

  Caller->>Lock: 写入 { pid, host, port, endpoint, url }
  Caller->>App: app.listen(port)
  alt EADDRINUSE
    App-->>Caller: error
    Caller->>App: app.listen(0)  // OS 分配
    App-->>Caller: actualPort
    Caller->>Lock: updateLockPort(actualPort)
  else 成功
    App-->>Caller: listening on port
  end

  Caller-->>Caller: 注册 SIGINT/SIGTERM 清理 lock
  Note over Caller: AgentILS HTTP server listening at <url>
```

## 关键文件

- `packages/mcp/src/runtime/lock.ts` — `acquireRuntimeLock` / `pickFreePort` / `updateLockPort`
- `packages/mcp/src/gateway/transports.ts` — `startStreamableHttpServer` / `startIfEntrypoint` / EADDRINUSE 回退
- `packages/mcp/src/index.ts` — 入口，分流 `--stdio` 与 HTTP

## 为什么要回退 + 改写 lock

`pickFreePort` 与 `app.listen` 之间存在短窗口被其它进程抢占（TOCTOU）。回退到 `port=0`（OS 分配）保证 listen 必成功；之后用真实端口改写 lock，让扩展 / Copilot 能读到正确 url。

## 客户端如何找到正确 url

- Copilot：读 `.vscode/mcp.json`（CLI 写入的默认值或扩展同步过的真实值）
- 扩展：调 `runtimeClient.getCurrentLock()` → 读 lock 文件 → 必要时 `syncMcpJsonUrl()` 更新 mcp.json
