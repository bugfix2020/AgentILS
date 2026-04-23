# 01 — Plan C 部署拓扑

每工作区 **只有一个** 运行中的 MCP HTTP server；Copilot 与扩展同时连接它。

```mermaid
flowchart LR
  subgraph WS[Workspace]
    direction TB
    LOCK["~/.agentils/runtime-{sha1(workspace).slice(0,12)}.lock<br/>{ pid, host, port, endpoint, url }"]
    MCP["packages/mcp<br/>HTTP MCP server<br/>http://127.0.0.1:8788/mcp<br/>(默认端口；被占则回退随机)"]
    LOCK -. "PID 存活探测<br/>updateLockPort 写回" .-> MCP
  end

  subgraph IDE[VS Code]
    Copilot["Copilot Chat<br/>(读 .vscode/mcp.json)"]
    EXT["extensions/agentils-vscode<br/>thin bridge<br/>runtime-client + WebView"]
    WV["WebView<br/>(Vite + React 19 + AntD)"]
    EXT --- WV
  end

  Copilot -- "HTTP MCP" --> MCP
  EXT -- "HTTP MCP<br/>(spawn 仅在 lock 不存活时)" --> MCP
  EXT -- "openPanel: getCurrentLock<br/>同步 mcp.json url" --> LOCK
```

## 要点

- **单 server**：第二次启动 MCP 时若发现 lock 指向存活进程，直接退出，避免双 server。
- **共享真值**：Copilot 与扩展看到的是同一份 `state://*`、同一份 task。
- **mcp.json url 自动同步**：默认写 `http://127.0.0.1:8788/mcp`；如果实际绑定到回退端口，扩展在 `openPanel` 时改写 mcp.json。
- **EADDRINUSE 收敛**：`pickFreePort` 之后 `app.listen` 仍可能被抢；transports 层 catch EADDRINUSE → port=0 → `updateLockPort()` 写回真实端口。
