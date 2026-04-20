# agentils-vscode - VS Code Extension

VS Code 扩展，负责与 MCP control plane 通信，提供 IDE 交互层。

## 职责

这是 AgentILS 在 VS Code 中的**交互和集成层**，不承载业务逻辑。核心职责：

- **Webview UI**：任务控制台、交互面板等 UI 组件
- **MCP 桥接**：通过 stdio 子进程连接 MCP Server，处理双向通信
- **会话管理**：维护用户会话和交互状态
- **LM Tools 注册**：将 MCP tools 暴露为 VS Code LM (Copilot) 工具
- **Chat Participant 注册**：`@agentils` 聊天参与者实现
- **命令和状态栏**：VS Code 命令和状态栏 UI

## 架构

```
VS Code Extension Context
    ↓
AgentILSMcpElicitationBridge (stdio 子进程)
    ↓
MCP Server (packages/mcp)
```

### 关键模块

| 模块 | 职责 |
|------|------|
| `extension.ts` | 核心入口，初始化所有组件 |
| `session/` | ConversationSessionManager（会话和交互状态管理） |
| `interaction-channel/` | 本地面板、远程交互通道 |
| `runtime-client/` | MCP 请求客户端配置 |
| `lm-tools/` | LM 工具定义，供 Copilot Chat 使用 |
| `mcp-elicitation-bridge.ts` | MCP elicitation 请求的桥接处理 |
| `webview/` | Webview UI（React + Ant Design） |

## 启动流程

### Extension 激活

```typescript
// 1. 初始化组件
const client = new RepoBackedAgentILSTaskServiceClient(context)
const sessionManager = new ConversationSessionManager(client)
const bridge = new AgentILSMcpElicitationBridge(context, sessionManager)

// 2. 注册 VS Code 命令和参与者
registerAgentILSCommands(context, sessionManager, openConsole)
registerAgentILSChatParticipant(context, sessionManager)
registerAgentILSLanguageModelTools(context, sessionManager)

// 3. 连接 MCP Server
await sessionManager.refresh() // 初始状态同步
await bridge.connect(mcpServerPath) // 启动 MCP 子进程
```

### MCP 连接

1. `resolveMcpServerPath()` 定位 MCP 产物（优先 sibling 开发布局）
2. `bridge.connect()` 启动 MCP 进程，建立双向通信
3. 监听 MCP Server 的 elicitation 请求，转发到 webview

## 与 MCP 通信契约

### 调用 MCP Tools

通过 `task-service-client.ts` 的 HTTP 请求：

```typescript
await this.client.startTask(input)  // 调用 MCP 的 new_task_request
await this.client.startTaskGate(input) // 调用 MCP 的 ui_task_start_gate
```

### 处理 Elicitation

MCP tool 通过 `ctx.elicitUser()` 发起请求，由 `AgentILSMcpElicitationBridge` 接收：

```typescript
// Bridge 接收 elicitation 请求
bridge.on('elicitation', (params) => {
  // 转发到 sessionManager
  sessionManager.handleMcpElicitation(params)
  // 在 webview 显示交互 UI
})
```

### Webview 的两类用户输入（Session-Driven Continuation）

**1. submitPendingInteraction** - 响应 MCP elicitation
- 用户填充 GuidedPromptBubble 或审批界面 → 点击提交
- Webview 发送 `postMessage({ action: 'submitPendingInteraction', ... })`
- Extension → ElicitationBridge → MCP 更新 session 状态
- MCP runner 恢复 elicitation handler，工具继续执行

**2. submitSessionMessage** - 自由会话消息
- 用户在消息输入框输入 → 点击发送
- Webview 发送 `postMessage({ action: 'submitSessionMessage', text: '...' })`
- Extension → MCP 追加到 session.transcript
- MCP runner 调用 `request.model.sendRequest()` 重新推理
- LLM 结果（assistant chunks + tool calls）流回 webview
- Chat 继续，不结束

**关键保证**：无论哪种输入，都会导致 LLM 继续推理或 MCP 继续执行。Chat 永不结束（直至用户关闭）。

## Webview

位于 `webview/` 目录，是独立的 Vite 应用（React 19 + Ant Design 6）。

### 关键组件

| 组件 | 职责 |
|------|------|
| `App.tsx` | 根组件，状态管理、路由 |
| `WelcomeScreen.tsx` | 欢迎页面 |
| `HeaderBar.tsx` | 顶部菜单栏 |
| `Sidebar.tsx` | 侧边栏（任务历史等） |
| `BubbleRenderer.tsx` | 聊天气泡渲染 |
| `GuidedPromptBubble.tsx` | MCP elicitation 交互组件 |
| `Sender.tsx` | 消息输入框 |

### Webview ↔ Extension 通信

使用 VS Code Webview API：

```typescript
// Webview → Extension
acquireVsCodeApi().postMessage({ action: 'submitSessionMessage', content: '...' })

// Extension → Webview (window.__AGENTILS_BOOTSTRAP__)
webviewPanel.webview.postMessage({ type: 'stateUpdate', payload: newState })
```

## 调试指南

### 本地开发

```bash
# 在根目录运行
pnpm run build

# 在 VS Code 中按 F5 启动调试
# 自动打开新的 VS Code 窗口，加载开发中的扩展
```

### 日志输出

- Extension 日志：VS Code 的输出面板（Output → AgentILS）
- Webview 日志：浏览器开发者工具（右键 → 检查）
- MCP 日志：stderr（出现在调试窗口的终端）

## 与其他项目的关系

```
extensions/agentils-vscode (VS Code 交互层)
    ↑ ↓ MCP 通信
packages/mcp (状态机 + 业务逻辑)

packages/cli (配置分发) → 需要 vscode-debug 的扩展配置
```

详见根目录 README 和 [Developer Guide](../../docs/agentils/developer-guide.md)

## 配置

### VS Code Settings

在用户或工作区 settings.json 中：

```json
{
  "agentils.runtime.serverModulePath": "path/to/mcp/dist/index.js",
  "agentils.taskConsole.showStatusBar": true
}
```

### MCP Configuration

通过 `.vscode/mcp.json` 配置（由 CLI 自动生成）

## 构建和发布

```bash
# 构建 Extension + Webview
pnpm run build:agentils-vscode

# 打包 .vsix 发布包
pnpm -C extensions/agentils-vscode package
```
