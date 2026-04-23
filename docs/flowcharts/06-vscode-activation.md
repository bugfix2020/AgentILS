# 06 — VS Code 扩展激活流程

```mermaid
sequenceDiagram
  autonumber
  participant VSCode as VS Code (EDH)
  participant Ext as extension.ts
  participant RC as runtime-client.ts
  participant Lock as ~/.agentils/runtime-*.lock
  participant MCP as packages/mcp child / 已运行 server
  participant WV as webview-host.ts
  participant UI as WebView (React)

  VSCode->>Ext: activate(context) [onStartupFinished]
  Ext->>Ext: ensureWorkspaceRoot()
  Ext->>Ext: installPromptPack(workspaceRoot)
  Note right of Ext: 写 .vscode/mcp.json (HTTP 8788)<br/>+ .github/{agents,prompts}/
  Ext->>RC: new AgentILSRuntimeClient({ workspaceRoot, ... })
  Ext->>WV: new AgentILSLoopWebviewHost(context)
  Ext->>VSCode: register commands (installPromptPack, openPanel)
  Note over Ext: activate 完成

  VSCode->>Ext: 用户执行 "agentils.openPanel"
  Ext->>RC: getCurrentLock()
  RC->>Lock: 读取
  alt lock 不存在 / pid 不存活
    RC->>MCP: spawn(node packages/mcp/dist/index.js)
    loop 等 lock（≤ 8000ms，每 100ms）
      RC->>Lock: 探测
    end
    Lock-->>RC: { url, port, ... }
  else 已存活
    Lock-->>RC: { url, port, ... }
  end
  RC->>RC: connect StreamableHTTPClientTransport(url)

  RC-->>Ext: lock info
  Ext->>Ext: 若 lock.url ≠ mcp.json.url → syncMcpJsonUrl()

  Ext->>RC: subscribeResource('state://current')
  Ext->>RC: subscribeResource('state://interaction/pending')
  Ext->>RC: setElicitationHandler(params => WV.show_elicitation)
  Ext->>RC: onResourceUpdate(uri => stateGet → WV.render)

  Ext->>WV: show()
  WV->>UI: panel.webview.html = bundled
  UI-->>WV: postMessage 'ready'
  WV-->>Ext: rendered
  Ext->>RC: stateGet() → WV.render(viewModel)

  loop 任务循环
    UI-->>WV: submit_user_message / submit_elicitation_result
    WV-->>Ext: onUserAction handler
    Ext->>RC: runTaskLoop({ ... })
    RC->>MCP: tool call run_task_loop
    MCP-->>RC: result + push state:// updates
    RC-->>Ext: onResourceUpdate → re-fetch + re-render
  end
```

## 文件对照

- `extensions/agentils-vscode/src/extension.ts` — activate / installPromptPack / syncMcpJsonUrl / commands
- `extensions/agentils-vscode/src/runtime-client.ts` — lock 查找 + spawn + HTTP MCP 连接 + close 兜底
- `extensions/agentils-vscode/src/webview-host.ts` — WebViewPanel 生命周期 + pendingResolver + onUserAction
- `extensions/agentils-vscode/src/webview-protocol.ts` — host ↔ webview 协议
- `extensions/agentils-vscode/webview/` — 独立 Vite + React 子工程

## 已废除的旧组件（V1 不应重新引入）

- `chat-participant.ts` / `session/` / `interaction-channel/` / `lm-tools/`
- `mcp-elicitation-bridge.ts`（独立 stdio 子进程桥）
- `task-service-client.ts` / `task-console-panel.ts` / `panel/`
