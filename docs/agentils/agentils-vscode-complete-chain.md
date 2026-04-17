# AgentILS VSCode 插件完整调用链路分析

版本：v1.0  
来源：`extensions/agentils-vscode/` 目录逐文件分析  
日期：2026-04-16  
用途：理解 AgentILS VSCode 插件层的完整实现链路，为拆分方案提供依据

---

## 0. 阅读前提示

本文档按**模块 → 文件 → 函数调用级别**描述 AgentILS VSCode 插件的完整实现链路。  
目的是让实现者清楚知道：插件如何激活、工具如何注册、WebView 如何交互、MCP 如何反向桥接。

---

## 1. 目录结构

```
extensions/agentils-vscode/
├── package.json                            # 插件清单
├── tsconfig.json                           # TypeScript 配置
├── src/
│   ├── extension.ts                        # 插件主入口
│   ├── commands.ts                         # VS Code 命令注册
│   ├── model.ts                            # 核心类型定义（30+ 接口）
│   ├── task-service-client.ts              # 运行时 API 客户端
│   ├── task-console-panel.ts               # WebView 面板主类
│   ├── mcp-elicitation-bridge.ts           # MCP Server 反向 elicitation 桥梁
│   ├── status-surface.ts                   # 状态栏显示
│   ├── vscode-shim.d.ts                    # VSCode API 类型垫片
│   ├── interaction-channel/                # 交互通道层
│   │   ├── types.ts                        # 交互通道接口
│   │   ├── local-panel-channel.ts          # 本地 WebView 交互
│   │   └── remote-delegate-channel.ts      # 远程代理交互（存根）
│   ├── lm-tools/                           # 语言模型工具注册
│   │   ├── index.ts                        # 工具注册主入口（6 个工具）
│   │   └── tool-result-builder.ts          # 工具结果构建器
│   ├── panel/                              # WebView UI 层
│   │   ├── task-console-protocol.ts        # WebView 消息协议
│   │   └── task-console-renderer.ts        # HTML 渲染函数
│   ├── prompt-pack/                        # 提示词模板管理
│   │   ├── index.ts                        # 提示词包命令入口
│   │   ├── installer.ts                    # 提示词安装逻辑
│   │   └── template-loader.ts             # 模板加载器
│   └── session/                            # 对话会话管理
│       ├── conversation-session-manager.ts # 会话生命周期管理
│       └── pending-interaction-registry.ts # 待处理交互队列
└── templates/                              # 8 个提示词模板文件
    ├── agentils.orchestrator.agent.md
    ├── agentils.plan.agent.md
    ├── agentils.execute.agent.md
    ├── agentils.verify.agent.md
    ├── agentils.handoff.agent.md
    ├── agentils.run-task.prompt.md
    ├── agentils.approval.prompt.md
    └── agentils.feedback.prompt.md
```

---

## 2. package.json 分析

### 2.1 激活事件

```json
{ "activationEvents": ["onStartupFinished"] }
```

VS Code 启动完成后激活，常驻内存。

### 2.2 命令注册

| 命令 ID | 标题 | 用途 |
|---------|------|------|
| `agentils.openTaskConsole` | 打开任务控制台 | 显示 WebView 面板 |
| `agentils.newTask` | 新建任务 | 以 `newTask` 模式打开控制台 |
| `agentils.continueTask` | 继续任务 | 以 `continueTask` 模式打开控制台 |
| `agentils.markTaskDone` | 标记任务完成 | 以 `markTaskDone` 模式打开控制台 |
| `agentils.acceptOverride` | 接受风险覆盖 | 以 `acceptOverride` 模式打开控制台 |
| `agentils.openSummary` | 打开任务总结 | 在编辑器中打开 markdown 总结文件 |
| `agentils.installPromptPack` | 安装提示词包 | 复制 8 个模板到 VS Code 用户配置 |

### 2.3 语言模型工具

| 工具名 | 输入参数 | 用途 |
|--------|---------|------|
| `agentils_start_conversation` | `title, goal, controlMode?` | 启动新任务对话 |
| `agentils_continue_task` | `note?, preferredRunId?` | 推进当前任务 |
| `agentils_request_clarification` | `question, context?, placeholder?, required?, preferredRunId?` | 请求用户澄清 |
| `agentils_request_feedback` | `question, summary, allowedActions?, preferredRunId?` | 请求用户反馈 |
| `agentils_request_approval` | `summary, riskLevel, targets?, preferredRunId?` | 请求高风险操作批准 |
| `agentils_finish_conversation` | `preferredRunId?` | 结束对话 |

---

## 3. 文件清单与职责

| 文件 | 职责 | 主要导出 | 关键依赖 |
|------|------|---------|---------|
| `extension.ts` | 插件生命周期、依赖注入容器 | `activate()`, `deactivate()` | 所有模块 |
| `commands.ts` | VS Code 命令注册和事件绑定 | `registerAgentILSCommands()` | vscode, SessionManager |
| `model.ts` | 核心类型定义（30+ 接口） | 类型合同 | （无依赖） |
| `task-service-client.ts` | 运行时通信客户端（HTTP/本地） | `RepoBackedAgentILSTaskServiceClient` | vscode |
| `task-console-panel.ts` | WebView 面板生命周期和消息路由 | `TaskConsolePanel` | vscode, SessionManager, protocol |
| `mcp-elicitation-bridge.ts` | MCP Server 反向 elicitation 处理 | `AgentILSMcpElicitationBridge` | @modelcontextprotocol/sdk |
| `status-surface.ts` | 状态栏实时更新 | `AgentILSStatusSurface` | vscode |
| `interaction-channel/types.ts` | 交互通道接口抽象 | `AgentILSInteractionChannel` | - |
| `interaction-channel/local-panel-channel.ts` | 本地 WebView 交互通道 | `LocalPanelInteractionChannel` | TaskConsolePanel |
| `interaction-channel/remote-delegate-channel.ts` | 远程交互通道（空实现） | `RemoteDelegateInteractionChannel` | - |
| `lm-tools/index.ts` | 6 个语言模型工具注册 | `registerAgentILSLanguageModelTools()` | vscode, SessionManager |
| `lm-tools/tool-result-builder.ts` | 工具结果 JSON 序列化 | `buildJsonToolResult()` | vscode |
| `panel/task-console-protocol.ts` | WebView ↔ Extension 消息协议 | 消息类型和模式定义 | - |
| `panel/task-console-renderer.ts` | WebView HTML 生成 | `renderTaskConsoleHtml()` | model, protocol |
| `prompt-pack/index.ts` | 提示词包安装命令 | `registerAgentILSPromptPackCommands()` | vscode, installer |
| `prompt-pack/installer.ts` | 复制模板文件到用户目录 | `installAgentILSPromptPack()` | fs, path |
| `prompt-pack/template-loader.ts` | 从扩展目录加载模板 | `loadAgentILSPromptPack()` | fs, path |
| `session/conversation-session-manager.ts` | 会话生命周期和状态投影 | `ConversationSessionManager` | vscode, model, client, registry |
| `session/pending-interaction-registry.ts` | 待处理交互 Promise 队列 | `PendingInteractionRegistry` | vscode, model |

---

## 4. 逐文件详细分析

### 4.1 `extension.ts` — 插件主入口

**职责**：完整的生命周期管理和依赖注入容器

```
activate(context: ExtensionContext):
  1. client = new RepoBackedAgentILSTaskServiceClient(context)
     └─ 构建 runtime 状态读取客户端
  
  2. sessionManager = new ConversationSessionManager(client)
     └─ 监听 client.onDidChange，投影出 AgentILSPanelState
  
  3. interactionChannel = new LocalPanelInteractionChannel(extensionUri, sessionManager)
     └─ 创建 WebView 交互通道
  
  4. statusSurface = new AgentILSStatusSurface(client)
     └─ 创建状态栏并订阅 runtime 变化
  
  5. registerAgentILSCommands(context, sessionManager, openConsole)
     └─ 注册 7 个 VS Code 命令
  
  6. registerAgentILSLanguageModelTools(context, sessionManager)
     └─ 注册 6 个语言模型工具
  
  7. registerAgentILSPromptPackCommands(context)
     └─ 注册 "安装提示词包" 命令
  
  8. bridge = new AgentILSMcpElicitationBridge(context, sessionManager)
  9. bridge.connect(mcpServerPath)
     └─ 连接到 MCP Server 子进程
  
  10. context.subscriptions.push(status, sessionManager, interactionChannel, bridge)
      └─ 注册所有可释放资源
```

**关键设计**：
- **依赖注入**：`sessionManager` 作为中央事件总线
- **MCP 双向通信**：正向（LM Tool → MCP call）+ 反向（`elicitation/create` → VSIX WebView）

### 4.2 `task-service-client.ts` — Runtime 通信客户端

**职责**：隔离运行时调用，支持 HTTP 和本地两种模式

```typescript
interface AgentILSTaskServiceClient {
  onDidChange: Event<AgentILSRuntimeSnapshot>
  snapshot(): AgentILSRuntimeSnapshot
  refresh(): Promise<AgentILSRuntimeSnapshot>
  startTask(input): Promise<AgentILSRuntimeSnapshot>
  continueTask(input?): Promise<AgentILSRuntimeSnapshot | null>
  markTaskDone(input?): Promise<AgentILSRuntimeSnapshot | null>
  acceptOverride(input): Promise<AgentILSRuntimeSnapshot | null>
  beginApproval(input): Promise<AgentILSRuntimeSnapshot>
  recordApproval(input): Promise<AgentILSRuntimeSnapshot>
  recordFeedback(input): Promise<AgentILSRuntimeSnapshot>
  finishConversation(input?): Promise<AgentILSFinishConversationResult>
  getSummaryDocument(taskId?): AgentILSTaskSummaryDocument | null
  openSummaryDocument(taskId?): Promise<Uri | null>
}
```

**调用路由**：

| 条件 | 方式 | 说明 |
|------|------|------|
| `agentils.runtime.httpBaseUrl` 配置存在 | HTTP POST | `http://baseUrl/control-plane/{actionName}` |
| 存在 `dist/control-plane/index.js` | Node fork | 子进程执行 control-plane 方法 |
| 默认 | 本地文件读写 | `.data/agentils-state.json` |

```
invokeAsync<T>(actionName, payload):
  ├── 如果 httpBaseUrl → POST http://baseUrl/control-plane/{actionName}
  ├── 否则 fork node 进程执行 control-plane 方法
  └── 解析 JSON 结果并发射 onDidChange 事件
```

### 4.3 `mcp-elicitation-bridge.ts` — MCP 反向通信

**职责**：建立 MCP Server 连接并处理服务端的 `elicitation/create` 请求

```
new AgentILSMcpElicitationBridge(context, sessionManager)
  │
  └─ connect(serverPath):
     ├── 动态加载 @modelcontextprotocol/sdk
     ├── new StdioClientTransport({ command: 'node', args: [serverPath] })
     ├── new Client()
     ├── client.setRequestHandler('elicitation/create', this._handleElicitation)
     └── client.connect(transport)

  _handleElicitation(params):
     ├── 解析 params.mode ('approval' | 'feedback')
     ├── 如果 mode == 'approval':
     │     sessionManager.requestApproval(params)
     │     → WebView 显示审批表单
     │     → 用户选择 accept/decline/cancel
     │     → 返回 { action, content }
     └── 如果 mode == 'feedback':
           sessionManager.requestFeedback(params)
           → WebView 显示反馈表单
           → 用户选择 continue/done/revise
           → 返回 { action, content }
```

**消息格式**（Server → VSIX）：
```typescript
{
  method: 'elicitation/create',
  params: {
    mode: 'approval' | 'feedback',
    message?: string,
    summary?: string,
    riskLevel?: 'low' | 'medium' | 'high',
    targets?: string[],
    runId?: string
  }
}
```

**响应格式**（VSIX → Server）：
```typescript
{
  action: 'accept' | 'decline' | 'cancel' | 'accepted',
  content?: { status: string, msg: string }
}
```

**已知问题**：`@modelcontextprotocol/sdk` 未在 `extensions/agentils-vscode/package.json` 中声明，依赖 root `node_modules`。独立 VSIX 打包时必须修复。

### 4.4 `session/conversation-session-manager.ts` — 会话核心

**职责**：管理对话状态投影、待处理交互队列、用户交互工作流

**状态投影**：
```
snapshot(): AgentILSPanelState
  ├── snapshot: 来自 TaskServiceClient（runtime 真值源）
  ├── pendingInteraction: 来自 PendingInteractionRegistry（UI 等待源）
  ├── controlMode: 派生自 activeTask?.controlMode
  └── overrideActive: 派生自 activeTask?.overrideState.confirmed
```

**交互请求流程（Promise-based 阻塞）**：
```
requestClarification(input) → Promise<ClarificationResult>:
  1. ensureConsoleVisible('continueTask')
  2. registry.begin<ClarificationResult>({ kind: 'clarification', ... })
     → 返回 Promise
  3. WebView 显示澄清表单
  4. 用户提交 → submitClarification() → registry.resolve()
  5. Promise 完成，返回 { status: 'submitted', content: '...' }

requestFeedback(input) → Promise<FeedbackResult>:
  类似，kind: 'feedback'
  用户选择 continue/done/revise

requestApproval(input) → Promise<ApprovalResult>:
  类似，kind: 'approval'
  额外显示 riskLevel 徽章和 targets 列表
  用户选择 accept/decline/cancel
```

**关键设计**：
- **Promise-based 交互**：阻塞 LM 直到用户回复，实现 "单次计费内多轮交互"
- **单一待处理**：`PendingInteractionRegistry` 确保同时只有一个活跃交互
- **异常处理**：如果 registry 已有待处理交互，新请求会抛错

### 4.5 `session/pending-interaction-registry.ts` — 交互队列

```
class PendingInteractionRegistry {
  // 同时只能有一个 pending interaction
  private pending: PendingInteraction<any> | null = null

  begin<T>(descriptor): Promise<T>
    ├── 如果已有 pending → throw Error('Already has pending interaction')
    ├── pending = { requestId, kind, resolve, reject, ... }
    ├── 触发 onDidChange 事件
    └── return new Promise

  resolve(requestId, result):
    ├── 如果 requestId 不匹配 → 忽略
    ├── pending.resolve(result)
    ├── pending = null
    └── 触发 onDidChange

  reject(requestId, error):
    ├── pending.reject(error)
    ├── pending = null
    └── 触发 onDidChange

  current(): PendingInteraction | null
}
```

### 4.6 `task-console-panel.ts` — WebView 面板管理

```
static createOrShow(extensionUri, sessionManager, composerMode):
  ├── 如果已有 panel → 刷新模式并 reveal
  └── 否则创建新 panel:
       vscode.window.createWebviewPanel({
         id: 'agentilsTaskConsole',
         title: 'AgentILS Task Console',
         viewColumn: Active,
         enableScripts: true,
         retainContextWhenHidden: true
       })
       ↓
       new TaskConsolePanel(panel, sessionManager, composerMode)
         ├── panel.webview.onDidReceiveMessage(handleMessage)
         ├── sessionManager.onDidChange(() → render())
         └── render()
```

**消息路由**：

| WebView 消息 | 处理方法 |
|-------------|---------|
| `submitNewTask` | `sessionManager.startTask()` |
| `submitContinueTask` | `sessionManager.continueTask()` |
| `submitMarkTaskDone` | `sessionManager.markTaskDone()` |
| `submitAcceptOverride` | `sessionManager.acceptOverride()` |
| `submitPendingInteraction` | 根据 kind 调用 `submitClarification/Feedback/Approval()` |
| `cancelPendingInteraction` | `sessionManager.cancelPendingInteractionFromPanel()` |

**渲染循环**：
```
sessionManager.onDidChange()
  → panel.webview.html = renderTaskConsoleHtml(snapshot, composerMode)
```

### 4.7 `panel/task-console-renderer.ts` — HTML 生成器

**输出结构**：
```html
<!DOCTYPE html>
<html>
<head><style>/* 嵌入式 CSS */</style></head>
<body>
  <main class="console">
    <!-- 任务信息卡片 -->
    <section class="card">
      <h2>Task: {title}</h2>
      <dl>
        <dt>Goal</dt><dd>{goal}</dd>
        <dt>Phase</dt><dd>{phase}</dd>
        <dt>Status</dt><dd>{status}</dd>
        <dt>Control Mode</dt><dd>{renderControlModeBadge(mode)}</dd>
      </dl>
    </section>

    <!-- 待处理交互表单 -->
    {renderPendingInteraction(pendingInteraction)}

    <!-- 任务编辑器（四种模式之一） -->
    {renderComposer(state, composerMode)}
  </main>
  <script>
    const initialState = {JSON.stringify(panelState)};
    // 事件监听和提交处理...
  </script>
</body>
</html>
```

**Composer 模式**：

| 模式 | 表单字段 | 提交动作 |
|------|---------|---------|
| `newTask` | `title` (text), `goal` (textarea) | Start task |
| `continueTask` | `note` (textarea, 可选) | Continue task |
| `markTaskDone` | `summary` (textarea, 可选) | Mark done |
| `acceptOverride` | `acknowledgement` (textarea, 必填) | Accept override |

**Pending Interaction 表单**：

| kind | 字段 | 显示 |
|------|------|------|
| `clarification` | `content` (textarea) | 问题描述，必填 |
| `feedback` | `status` (select: continue/done/revise), `message` (textarea) | 问题和总结 |
| `approval` | `responseAction` (select: accept/decline/cancel), `status`, `message` | risk badge, targets |

### 4.8 `lm-tools/index.ts` — 语言模型工具注册

```
registerAgentILSLanguageModelTools(context, sessionManager):

  vscode.lm.registerTool('agentils_start_conversation', {
    invoke(options) {
      snapshot = await sessionManager.startTask(options.input)
      return buildJsonToolResult(snapshot)
    }
  })

  vscode.lm.registerTool('agentils_continue_task', {
    invoke(options) {
      snapshot = await sessionManager.continueTask(options.input ?? {})
      return buildJsonToolResult(snapshot)
    }
  })

  vscode.lm.registerTool('agentils_request_clarification', {
    invoke(options) {
      result = await sessionManager.requestClarification(options.input)
      // ← 阻塞，直到用户在 WebView 中提交
      return buildJsonToolResult({ result, snapshot })
    }
  })

  // 类似注册:
  // agentils_request_feedback → sessionManager.requestFeedback()
  // agentils_request_approval → sessionManager.requestApproval()
  // agentils_finish_conversation → sessionManager.finishConversation()
```

**关键行为**：
- `requestClarification/Feedback/Approval` 返回 Promise，**在用户提交前一直阻塞**
- 所有工具结果均为 `LanguageModelTextPart(JSON.stringify(payload))`
- 已有待处理交互时会抛错，LM 需重试

### 4.9 `status-surface.ts` — 状态栏

```
constructor(client, enabled = true):
  item = vscode.window.createStatusBarItem(Left, 120)
  item.command = 'agentils.openTaskConsole'
  client.onDidChange(snapshot → update(snapshot))

update(snapshot):
  无任务 → text = 'AgentILS: idle'
  有任务 → text = `AgentILS: ${controlMode} · ${phase}`
  tooltip = `Conversation: ${id}\nTask: ${title}\n...`
```

### 4.10 `prompt-pack/` — 提示词管理

```
loadAgentILSPromptPack(extensionRootPath):
  → 从 templates/ 目录读取 8 个 .md 文件

installAgentILSPromptPack(extensionRootPath):
  1. resolveUserPromptsDir()
     ├── macOS: ~/Library/Application Support/Code/User/prompts
     ├── Windows: %APPDATA%\Code\User\prompts
     └── Linux: ~/.config/Code/User/prompts
  2. loadAgentILSPromptPack()
  3. mkdirSync(promptsDir)
  4. 遍历模板 → writeFileSync(promptsDir/name, content)
  5. 返回 { promptsDir, writtenFiles, overwrittenFiles }
```

---

## 5. 完整调用链路图

### 场景 1：LM 工具启动任务

```
Claude (Copilot Chat)
  ↓ 调用工具 agentils_start_conversation(title, goal)
vscode.lm.registerTool handler
  ↓
sessionManager.startTask(input)
  ↓
client.startTask(input)
  ↓ fork 或 HTTP → control-plane/ui-actions.ts → startUiTask()
runtime 返回新 snapshot
  ↓
发射 sessionManager.onDidChange()
  ├── TaskConsolePanel.render() → WebView 刷新
  ├── StatusSurface.update() → 状态栏: "AgentILS: normal · collect"
  └── return buildJsonToolResult(snapshot) → 返回给 Claude
```

### 场景 2：用户在 WebView 中操作

```
WebView (HTML 表单)
  ↓ 用户点击 "Start task" → postMessage({ action: 'submitNewTask', ... })
TaskConsolePanel.handleMessage()
  ↓ 验证表单数据
sessionManager.startTask({ title, goal })
  ↓ （同场景 1）
```

### 场景 3：MCP Server 请求审批（反向 elicitation）

```
AgentILS MCP Server (subprocess)
  ↓ 执行 approval_begin tool → runtime.server.elicitInput(params)
JSON-RPC elicitation/create 请求 → StdioClientTransport
  ↓
AgentILSMcpElicitationBridge._handleElicitation(params)
  ↓
sessionManager.requestApproval(params)
  ├── ensureConsoleVisible('acceptOverride')
  │   └── TaskConsolePanel.reveal()
  └── registry.begin<ApprovalResult>()
      └── 返回 Promise
  ↓
WebView 显示审批表单
  ↓ 用户填写、选择、提交
TaskConsolePanel.submitApproval()
  → registry.resolve(requestId, result)
  ↓
Promise 完成 → JSON-RPC 响应返回 Server
  ↓
Server: recordApproval() → 状态推进
```

### 场景 4：LM 请求澄清（正向 LM Tool 阻塞）

```
Claude (Orchestrator Agent)
  ↓ 调用 agentils_request_clarification({ question: "目标分支是？" })
sessionManager.requestClarification(input)
  ├── ensureConsoleVisible()
  ├── registry.begin<ClarificationResult>()
  │   └── Promise 挂起
  ├── WebView 显示澄清表单
  ↓ 用户输入答案、点击 "Submit"
TaskConsolePanel.submitClarification()
  → registry.resolve(requestId, { status: 'submitted', content: '...' })
  ↓
Promise 完成
  → buildJsonToolResult({ result, snapshot })
  → 返回给 Claude
  ↓
Claude 拿到用户回答，继续推理
```

---

## 6. 当前实现状态评估

### ✅ 已完成功能

| 功能 | 完成度 | 备注 |
|------|--------|------|
| 插件激活和命令注册 | 100% | 完整的 lifecycle 管理 |
| 运行时通信（HTTP 和本地） | 100% | 双模式支持 |
| WebView 任务控制台 | 100% | 四种编辑模式 + 待处理交互 |
| 语言模型工具注册 | 100% | 6 个工具完整实现 |
| MCP 反向 elicitation | 100% | 支持 approval 和 feedback |
| 状态栏显示 | 100% | 实时更新 |
| 提示词包安装 | 100% | 8 个模板 |
| 对话会话管理 | 100% | SessionManager + Registry |
| 待处理交互队列 | 100% | Promise-based，支持 cancellation |

### ⚠️ 存根或缺失

| 功能 | 状态 | 说明 |
|------|------|------|
| `RemoteDelegateInteractionChannel` | 空实现 | 远程 WebView 预留 |
| 错误恢复和重试 | 最小化 | 单次失败直接显示错误 |
| 离线支持 | 无 | 完全依赖 runtime 连接 |
| 多对话支持 | 无 | 仅单个活跃对话 |
| MCP SDK 依赖声明 | 缺失 | 未在 package.json 中声明 |

---

## 7. 与 human-clarification VSIX 的对比

| 方面 | agentils-vscode | human-clarification |
|------|-----------------|---------------------|
| **工具注册方式** | `vscode.lm.registerTool` (package.json 声明) | `vscode.lm.registerTool` (ToolRegistry 动态) |
| **交互阻塞** | SessionManager Promise | WebviewManager Promise |
| **WebView** | HTML 字符串模板（renderer） | 独立 HTML 文件 + viewLoader |
| **状态管理** | 运行时投影 via TaskServiceClient | 无状态（每次独立） |
| **MCP 集成** | 双向桥接（elicitation bridge） | 无 MCP |
| **提示词系统** | 8 个模板包 + 安装命令 | 通过 @hc /install 安装 |
| **能力系统** | 无 | spawn-worker, proposal-helper, ability-manage |
| **任务管理** | 无独立面板 | taskManage WebView + TaskManageService |
| **历史记录** | 无 | HistoryService (90 天) |
| **报告/Todo** | 无 | writeReport + manageTodoList |
| **完成度** | 接近生产就绪 | 成熟产品 |

### 关键差异总结

1. **human-clarification 是通用工具箱**：提供 12+ 工具、任务管理、报告、历史记录、能力扩展
2. **agentils-vscode 是状态机 UI 层**：专注于 AgentILS 状态机的展示和交互，不包含独立的工具逻辑
3. **阻塞机制相同**：两者都使用 Promise 挂起实现 "单次计费内多轮交互"
4. **反向通信差异**：agentils-vscode 通过 MCP elicitation bridge，human-clarification 通过 WebSocket delegate

---

## 8. 与 MCP Server (`src/`) 的接口

### 8.1 三条通信通道

| 通道 | 方向 | 机制 | 用途 |
|------|------|------|------|
| **正向 LM Tool** | VSIX → MCP | `vscode.lm.registerTool` → MCP tool call | 启动任务、推进状态 |
| **反向 Elicitation** | MCP → VSIX | JSON-RPC `elicitation/create` → bridge | 审批弹窗、反馈弹窗 |
| **Control-Plane** | VSIX → MCP | HTTP POST / Node fork | UI 命令操作 |

### 8.2 正向 LM Tool 通道

```
Claude → agentils_start_conversation
  → sessionManager.startTask()
  → client.invokeAsync('startUiTask', payload)
  → HTTP POST /control-plane/startUiTask
  → src/control-plane/ui-actions.ts → startUiTask()
  → orchestrator.startRun()
  → store.startRun()
  → 返回 snapshot
```

### 8.3 反向 Elicitation 通道

```
src/gateway/context.ts → elicitUser(params)
  → server.server.elicitInput(params)
  → JSON-RPC elicitation/create → StdioTransport
  → mcp-elicitation-bridge.ts → _handleElicitation(params)
  → sessionManager.requestApproval/Feedback()
  → WebView 显示表单
  → 用户操作 → resolve
  → JSON-RPC 响应回 Server
  → Server 继续执行
```

### 8.4 Control-Plane 通道

```
VS Code 命令 agentils.continueTask
  → TaskConsolePanel → submitContinueTask
  → sessionManager.continueTask()
  → client.continueTask()
  → HTTP POST /control-plane/continueTask
  → src/control-plane/ui-actions.ts → continueTask()
  → store.transitionRun()
```

---

## 9. 设计洞察与问题

### 9.1 架构亮点

1. **单向数据流**：TaskServiceClient → snapshot → SessionManager → WebView，避免状态同步问题
2. **Promise-based 交互**：简化异步流程控制，与 human-clarification 模式一致
3. **灵活的运行时适配**：HTTP / 本地 fork 双模式，配置驱动
4. **WebView 完全自包含**：所有状态嵌入 HTML，无外部 API 依赖

### 9.2 设计问题

| 问题 | 影响 | 建议 |
|------|------|------|
| **MCP SDK 依赖缺失** | VSIX 独立打包失败 | 在 package.json 添加 `@modelcontextprotocol/sdk` |
| **WebView 全量重渲染** | 每次 state change 重新生成整个 HTML | 考虑增量更新或 WebView state preservation |
| **单 pending interaction** | LM 连续调用两个交互工具时会失败 | 考虑队列化或更好的冲突处理 |
| **无超时机制** | 交互 Promise 永不超时 | 添加 `Promise.race([request, timeout(30s)])` |
| **runtime 不可用时无降级** | MCP 连接失败后插件不可用 | 支持离线基础操作 |
| **RemoteDelegate 空实现** | 远程开发场景不可用 | 参考 human-clarification 的 WebSocket delegate 架构 |

### 9.3 拆分方案预分析

当前 agentils-vscode 的职责边界：
- **纯 UI 层**：WebView 渲染、命令注册、状态栏
- **通信桥梁**：LM Tool 注册、MCP elicitation bridge、runtime client
- **会话管理**：SessionManager、PendingInteractionRegistry

拆分时需保留的核心机制：
1. `vscode.lm.registerTool` → 必须在 VSIX 中
2. WebView Promise 挂起 → 必须在 VSIX 中
3. MCP elicitation bridge → 可解耦为独立模块
4. TaskServiceClient → 可解耦为独立通信层

拆分时可移到 MCP Server 的：
1. 所有状态逻辑 → 已在 `src/` 中
2. 控制模式转移 → 已在 `src/control/` 中
3. 审批/反馈决策逻辑 → 已在 `src/orchestrator/` 中
