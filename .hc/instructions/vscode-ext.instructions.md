# extensions/agentils-vscode 开发规则

本文件定义 `extensions/agentils-vscode` 的开发边界、组件职责、调用链路和约束。

## 核心定位

`extensions/agentils-vscode` 是 AgentILS 的 **VS Code 交互层**。它作为 MCP 的 IDE 适配层，提供 WebView UI、会话管理、LM 工具注册。**不承载业务逻辑**。

**职责**：
- WebView UI 渲染（React + Ant Design X）
- MCP Server 双向通信桥接（stdio 子进程 / HTTP）
- 会话状态投影管理（从 MCP 读取，投影到 WebView）
- Chat Participant 和 LM Tools 注册（暴露 MCP 能力给 Copilot Chat）
- Pending Interaction 的 UI 承接和 Promise 解决

**禁止事项**：
- 禁止在 Extension 中实现业务逻辑（审批规则、预算检查、策略评估等属于 packages/mcp）
- 禁止在 WebView 中手动计算 conversation 或 task 状态（消费 MCP 投影即可）
- 禁止让 WebView 直接持有状态真值（WebView 只是 UI 投影层）
- 禁止在 Extension 中存储跨会话持久状态（状态真值源在 MCP）

## 组件职责

### 激活入口

| 文件 | 职责 |
|------|------|
| `src/extension.ts` | Extension 激活入口。创建 TaskServiceClient → SessionManager → InteractionChannel → StatusSurface → McpElicitationBridge，注册所有 commands/participant/tools |

**激活链路**：
```
activate(context)
  → new RepoBackedAgentILSTaskServiceClient(context)
  → new ConversationSessionManager(client)
  → new LocalPanelInteractionChannel(extensionUri, sessionManager)
  → sessionManager.setInteractionChannel(interactionChannel)
  → client.setElicitationHandler(params => sessionManager.handleMcpElicitation(params))
  → registerAgentILSCommands()
  → registerAgentILSChatParticipant()
  → registerAgentILSLanguageModelTools()
  → sessionManager.refresh()                    // 初始快照
  → bridge.connect(mcpServerPath)               // MCP elicitation 桥接
```

### Chat Participant

| 文件 | 职责 |
|------|------|
| `src/chat-participant.ts` | `@agentils` Chat Participant 入口 |

**当前行为**：`@agentils` 只打开 WebView，不驱动模型循环。
```
用户在 Copilot Chat 输入 @agentils
  → participant handler 触发
  → sessionManager.revealConsole('newTask', true)  // 打开 WebView
  → response.markdown('...')                        // 返回提示信息
  → return                                          // 立即结束
```

### Session 管理

| 文件 | 职责 |
|------|------|
| `src/session/conversation-session-manager.ts` | 核心会话管理器。映射 WebView 事件到 session 变更，管理 pending interaction 生命周期 |
| `src/session/pending-interaction-registry.ts` | Pending interaction 的 Promise 注册/解决机制 |

**ConversationSessionManager 关键方法**：

| 方法 | 作用 |
|------|------|
| `snapshot()` | 构建 AgentILSPanelState（合并 runtime snapshot + registry interaction） |
| `startTask(input)` | 通过 client 调用 MCP ui_task_start |
| `startTaskGate(input)` | 通过 client 调用 MCP ui_task_start_gate |
| `submitSessionMessage(content)` | 通过 client 追加 user message 到 MCP session transcript |
| `appendAssistantMessage(content)` | 通过 client 追加 assistant message 到 MCP session transcript |
| `requestClarification(input)` | 在 registry 中创建 clarification pending interaction（本地 Promise） |
| `requestApproval(input)` | 在 registry 中创建 approval pending interaction（本地 Promise） |
| `requestFeedback(input)` | 在 registry 中创建 feedback pending interaction（本地 Promise） |
| `handleMcpElicitation(params)` | 接收 MCP elicitation 请求，根据 interactionKind 分发到对应的 request 方法 |
| `submitClarification(requestId, content)` | resolve registry 中的 clarification Promise |
| `submitApproval(requestId, action, status, message)` | resolve registry 中的 approval Promise |
| `submitFeedback(requestId, status, message)` | resolve registry 中的 feedback Promise |

**PendingInteractionRegistry**：
```
begin<TResult>(interaction) → Promise<TResult>   // 创建 pending，返回 Promise
resolve<TResult>(requestId, result)               // 按 requestId 解决 Promise
```
同一时刻只允许一个 pending interaction（`this.current` 是单值）。

### MCP 通信

| 文件 | 职责 |
|------|------|
| `src/task-service-client.ts` | `AgentILSTaskServiceClient` 接口 + `RepoBackedAgentILSTaskServiceClient` 实现。通过 MCP SDK 与 MCP Server 通信 |
| `src/mcp-elicitation-bridge.ts` | 作为 MCP client 连接到 MCP server subprocess，拦截 `elicitation/create` 请求并分发到 SessionManager |

**TaskServiceClient 通信模式**：
```
SessionManager.someMethod(input)
  → client.invokeSnapshotTool('tool_name', input)    // 或 invokeLocalTool
    → MCP client.callTool('tool_name', input)         // MCP SDK call
    → 解析返回的 text payload（JSON）
    → applySnapshot(snapshot)                          // 更新本地缓存
    → emitter.fire(snapshot)                           // 通知监听者（WebView）
```

**McpElicitationBridge 通信模式**：
```
MCP Server 调用 ctx.elicitUser()
  → MCP SDK 发送 elicitation/create JSON-RPC 请求
  → Bridge client 的 ElicitRequestSchema handler 触发
  → bridge._handleElicitation(params)
  → sessionManager.handleMcpElicitation(params)
    → 根据 interactionKind (startTask/approval/feedback) 分发
    → registry.begin() 创建 Promise
    → WebView 显示对应的交互 UI
    → 用户操作 → registry.resolve()
    → Promise 解决 → 返回结果给 MCP Server
```

### WebView / Panel

| 文件 | 职责 |
|------|------|
| `src/task-console-panel.ts` | TaskConsolePanel，管理 WebView panel 的创建、消息处理、状态推送 |
| `src/panel/task-console-protocol.ts` | WebView ↔ Extension 的消息协议定义 |
| `src/panel/task-console-renderer.ts` | WebView HTML 渲染 |
| `webview/src/App.tsx` | WebView 内的 React 应用入口 |
| `webview/src/types.ts` | WebView 侧的类型定义（与 Extension 侧对应） |

**WebView 消息处理链路**：
```
WebView 用户操作
  → postMessage({ action: 'submitSessionMessage' | 'submitPendingInteraction' | ... })
  → TaskConsolePanel.handleMessage(message)
    → switch (payload.action)
      'submitSessionMessage' → sessionManager.submitSessionMessage(content)
      'submitPendingInteraction' → sessionManager.submitPendingInteraction(payload)
      'submitNewTask' → sessionManager.startTask(input)
      'submitApprovalConfirm' → sessionManager.submitApproval(requestId, 'accept', ...)
      'submitApprovalDecline' → sessionManager.submitApproval(requestId, 'decline', ...)
      ...
```

**状态更新推送**：
```
MCP 状态变更
  → client.onDidChange → sessionManager.emitChange()
    → sessionManager.onDidChange → TaskConsolePanel.render()
      → panel.webview.postMessage({ type: 'stateUpdate', payload, composerMode })
        → WebView App useEffect handler → setState(payload)
```

### Interaction Channel

| 文件 | 职责 |
|------|------|
| `src/interaction-channel/types.ts` | `AgentILSInteractionChannel` 接口定义 |
| `src/interaction-channel/local-panel-channel.ts` | 本地面板通道（创建/显示 TaskConsolePanel） |
| `src/interaction-channel/remote-delegate-channel.ts` | 远程委托通道（空实现，`revealConsole` 为 no-op） |

### LM Tools

| 文件 | 职责 |
|------|------|
| `src/lm-tools/index.ts` | 注册 VS Code Language Model Tools，暴露 AgentILS 能力给 Copilot Chat |
| `src/lm-tools/tool-result-builder.ts` | 工具结果格式化 |

**注册的 LM Tools**：
- `agentils_start_conversation` — 通过 `sessionManager.startTaskGate()` 启动任务
- `agentils_continue_task` — 通过 `sessionManager.continueTask()` 继续任务
- `agentils_request_clarification` — 通过 `sessionManager.requestClarification()` 请求澄清
- `agentils_request_feedback` — 通过 `sessionManager.requestFeedback()` 请求反馈
- `agentils_request_approval` — 通过 `sessionManager.requestApproval()` 请求审批
- `agentils_finish_conversation` — 通过 `sessionManager.finishConversation()` 结束会话

## 两类用户输入的完整链路

### submitSessionMessage（用户自由发言）

```
用户在 WebView 输入框输入文本 → 点击发送
  → postMessage({ action: 'submitSessionMessage', content: '...' })
  → TaskConsolePanel.handleMessage()
    → sessionManager.submitSessionMessage(content)
      → content.trim() 非空检查
      → client.appendSessionUserMessage({ content: trimmed })
        → MCP tool: ui_session_append_user_message
          → store.appendSessionMessage(sessionId, message, queueUserMessage: true)
          → message 写入 session.messages[]
          → messageId 加入 session.queuedUserMessageIds[]
      → return snapshot()
```

**当前状态**：消息被写入 MCP session transcript 后，**没有 Runner 组件自动触发 LLM 推理**。Session Runner 是 haiku4.6-plan.md 中的待实现组件。

### submitPendingInteraction（解决挂起交互）

```
MCP Server 调用 ctx.elicitUser() → elicitation/create 请求到达 Bridge
  → Bridge handler → sessionManager.handleMcpElicitation(params)
    → 根据 interactionKind 选择处理方法
      'startTask' → sessionManager.requestTaskStart()
      'approval'  → sessionManager.requestApproval()
      其他        → sessionManager.requestFeedback()
    → registry.begin() 创建 Promise，WebView 渲染 UI

用户在 WebView 填写并提交
  → postMessage({ action: 'submitPendingInteraction', requestId, ... })
  → TaskConsolePanel.handleMessage()
    → sessionManager.submitPendingInteraction(payload)
      → 根据 kind 调用对应的 submit 方法
      → registry.resolve(requestId, result)
        → Promise 解决
        → 结果返回给 handleMcpElicitation
        → 返回给 Bridge → 返回给 MCP Server
        → MCP Server 继续执行后续逻辑
```

## 降级场景

当 VS Code Extension **不可用**时：
- MCP Server 的 `ctx.elicitUser()` 调用会因为没有连接的 client 而**失败或挂起**
- 不是"UI 简化"，而是"交互链路断裂"
- 协议层面支持任何声明了 elicitation capability 的 MCP client 承接
- 但当前产品实现尚未把非 VS Code client 的降级路径落完整

## 开发工作流

1. WebView 开发使用 `webview/` 子目录（独立 Vite 构建）
2. Extension 代码修改后需 `pnpm run build`
3. UI 只消费 MCP 投影，不自行计算状态
4. Approval/feedback 交互使用紧凑的结构化表单
5. 区分 `task_done` 和 `conversation_done` 在 UI 文案和状态处理中的差异
