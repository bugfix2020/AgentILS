# 06 — VS Code 扩展激活流程（V1 in-process）

```mermaid
sequenceDiagram
  autonumber
  participant VSCode as VS Code (EDH)
  participant Ext as extension.ts
  participant MCP as @agent-ils/mcp (in-process)
  participant Client as AgentilsClient
  participant LM as vscode.lm
  participant WV as AgentilsWebviewManager
  participant UI as WebView (apps/webview)

  VSCode->>Ext: activate(context) [onStartupFinished]
  Ext->>Ext: createMirroredChannel() + 读 agentils.mcp.* 配置
  alt agentils.mcp.autoStart === true (default)
    Ext->>MCP: startAgentilsServer({ stdio:false, http:true, httpPort:0,<br/>heartbeatTimeoutMs, sweepIntervalMs })
    MCP-->>Ext: RunningServer { http.port, orchestrator, store, stop }
    Note right of Ext: baseUrl = http://127.0.0.1:${server.http.port}
  else autoStart=false
    Note right of Ext: baseUrl = agentils.mcp.httpUrl (外部 mcp)
  end

  Ext->>Client: new AgentilsClient({ baseUrl })
  Ext->>Client: health() (启动自检)
  Ext->>WV: new AgentilsWebviewManager(context, baseUrl, log)

  Ext->>VSCode: registerCommand('agentils.openPanel')
  Ext->>VSCode: registerCommand('agentils.mcp.testConnection')
  Ext->>LM: registerTool × 4 (TOOL_BINDINGS)
  Note over Ext: activate 完成；返回 AgentilsExtensionApi

  VSCode->>Ext: 用户执行 "AgentILS: Open AgentILS Panel"
  Ext->>WV: ensurePanel()
  WV->>UI: 创建/聚焦 panel；注入 baseUrl
  UI->>MCP: EventSource(baseUrl + /api/events) (SSE 直连)
  UI->>MCP: GET /api/state (初始快照)

  loop LM tool 调用
    LM->>Ext: invoke('agentils_request_user_clarification', input)
    Ext->>Client: park({ toolName, question, context?, ... })
    Client->>MCP: POST /api/requests (HTTP)
    MCP->>MCP: orchestrator.park() → 写 store + parked promise<br/>broadcast SSE 'request.created'
    MCP-->>UI: SSE 'request.created' → 渲染表单
    UI->>MCP: POST /api/requests/:id/submit (用户提交)
    MCP->>MCP: orchestrator.resolve → parked.resolve(response)<br/>broadcast SSE 'interaction.submitted'
    MCP-->>Client: HTTP 200 + InteractionResponse
    Client-->>Ext: park promise resolve
    Ext->>LM: buildToolResultFromResponse → LanguageModelToolResult
  end

  VSCode->>Ext: deactivate()
  Ext->>WV: dispose()
  Ext->>MCP: server.stop()
```

## 文件对照（V1 真值）

- `packages/extensions/agentils-vscode/src/extension.ts` — `activate` / `deactivate`、in-process 启 mcp、注册 2 命令 + 4 LM tool、导出 `AgentilsExtensionApi`
- `packages/extensions/agentils-vscode/src/tools/registerTools.ts` — `TOOL_BINDINGS`（4 个 `lmId ↔ ToolName`）+ `vscode.lm.registerTool`
- `packages/extensions/agentils-vscode/src/tools/toolResult.ts` — `buildToolResultFromResponse` / `buildCancelledToolResult`（HTTP 409）/ `buildHeartbeatTimeoutToolResult`（HTTP 408）
- `packages/extensions/agentils-vscode/src/webview/manager.ts` — `AgentilsWebviewManager.ensurePanel()`：单 panel 复用、注入 `baseUrl`
- `packages/extensions/agentils-vscode/src/webview/protocol.ts` — host ↔ webview 消息类型，与 `apps/webview/src/protocol.ts` mirror
- `packages/mcp/src/index.ts` — `startAgentilsServer({ stdio?, http?, httpPort?, ... })` 返回 `RunningServer`
- `packages/mcp/src/transport/http.ts` — `POST /api/requests` / `POST /api/requests/:id/submit` / `GET /api/state` / `GET /api/events` (SSE)
- `packages/mcp/src/orchestrator/orchestrator.ts` — parked promise map + subscribers Set + `sweepExpired`

## V0 → V1 迁移要点

V1 不再有以下机制（出现在旧版 06 流程图里的概念全部已删）：

- `~/.agentils/runtime-*.lock` 文件协议、`acquireRuntimeLock` / `pickFreePort` / `updateLockPort`
- `runtime-client.ts` / `webview-host.ts` / `chat-participant.ts` / `mcp-elicitation-bridge.ts` / `task-service-client.ts`
- `installPromptPack` / `syncMcpJsonUrl` 命令 + `.vscode/mcp.json` 自动改写
- `state://*` MCP resource 订阅 / `subscribeResource` / `onResourceUpdate`
- spawn `node packages/mcp/dist/index.js` 子进程

V1 改用 `httpPort:0` 让 OS 分配端口 + extension 进程内 `import { startAgentilsServer }`，每个 extension host 独立 in-process mcp 实例。Copilot 通过 `.vscode/mcp.json` stdio 条目（由 `packages/cli init` 注入）拉起的子进程是**另一份** mcp（双 transport 同包），与扩展 in-process 的 mcp 共享同一份 `packages/mcp` 代码但是不同进程。
