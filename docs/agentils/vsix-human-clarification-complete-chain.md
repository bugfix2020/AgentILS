# human-clarification vsix 完整调用链路分析

版本：v2.0  
来源：`justwe9517.human-clarification-1.3.3.vsix` 实际拆包逐文件分析  
日期：2026-04-16（v2.0 更新）  
原始日期：2026-04-15（v1.0）  
用途：为 AgentILS 插件层实现提供参考，理解"一次计费完成多轮澄清"的插件架构

> **v2.0 变更说明**：逐文件比对实际代码后，补充了 v1.0 遗漏的 8 个工具 handler、2 个服务层模块、RichInput 子系统 6 个组件、Abilities 系统 16 个 action handler、以及若干差异修正。详见第 15-22 节。

---

## 0. 阅读前提示

本文档按**函数调用级别**描述整个插件的执行链路。  
目的是让实现者清楚知道：调用了什么方法、数据如何流动、WebView 如何承载用户交互、以及如何在不消耗多次高级请求次数的前提下完成多轮澄清。

---

## 1. 插件整体架构图

```
用户在 Copilot Chat 输入提示词
        ↓
LLM 决策：需要调用工具
        ↓
VS Code 执行 vscode.lm.registerTool 注册的工具 → ToolRegistry.registerTool()
        ↓
    ┌──────────────────────────────────────────┐
    │           LM Tool 触发层                 │
    │  prepareInvocation → 确认弹窗（可选）    │
    │  invoke → 对应 toolHandler()             │
    └──────────────────────────────────────────┘
        ↓
    ┌──────────────────────────────────────────┐
    │           DelegateClient 分流            │
    │  shouldDelegate() → WebSocket 委托模式   │
    │  !shouldDelegate → 本地 WebView 模式     │
    └──────────────────────────────────────────┘
        ↓ （本地模式）
    ┌──────────────────────────────────────────┐
    │     ClarificationWebviewManager          │
    │  requestClarification() → 创建 WebView   │
    │  await Promise → 等待用户回复            │
    └──────────────────────────────────────────┘
        ↓
    用户在 WebView 中填写回复并提交
        ↓
    handleWebviewMessage({ type: 'submit' })
        ↓
    request.resolve(response)
        ↓
    buildToolResultFromResponse(result)
        → vscode.LanguageModelToolResult([LanguageModelTextPart, ...])
        ↓
    返回给 LLM → LLM 继续下一轮推理
```

---

## 2. 插件激活入口：`activate(context)`

**文件**：`out/extension.js`

```
activate(context)
  ├── vscode.window.createOutputChannel('Human Clarification')
  ├── new ClarificationWebviewManager(context)           // WebView 管理器
  ├── new DelegateClient(context, outputChannel)         // WebSocket 委托客户端
  ├── new ToolRegistry(context, { webviewManager, outputChannel, delegateClient })
  │     └── toolRegistry.registerAll()                   // 注册 4 个 LM tools
  ├── vscode.commands.registerCommand('humanClarification.delegate.toggle', ...)
  ├── vscode.commands.registerCommand('humanClarification.delegate.statusBarMenu', ...)
  ├── vscode.commands.registerCommand('humanClarification.delegate.testConnection', ...)
  ├── registerFeedbackTestCommand(context, webviewManager)
  ├── vscode.chat.createChatParticipant('human-clarification.hc', handler)
  │     └── 响应 @hc /install 指令 → 调用 loadHcInstallTemplate() + installFromTemplate
  ├── new CopilotHttpServer(outputChannel)               // HTTP API 服务器（可选）
  ├── httpServer.autoStartIfConfigured()
  ├── delegateClient.autoConnectIfConfigured()           // 自动连接 WebSocket 服务器
  └── registerLocalPrompts(context)                      // 本地 Prompt 文件命令
```

**关键设计**：激活时 `onStartupFinished`，常驻内存，不重复激活。

---

## 3. LM Tool 注册层：`ToolRegistry`

**文件**：`out/tools/toolRegistry.js`

### 3.1 注册的 4 个工具

| 工具名 | Handler | 用途 |
|---|---|---|
| `request_user_clarification` | `clarificationToolHandler` | 向用户澄清问题 |
| `request_contact_user` | `contactToolHandler` | 主动联系用户传达信息 |
| `request_user_feedback` | `feedbackToolHandler` | 收集用户反馈（continue/done/revise） |
| `request_dynamic_action` | `dynamicActionToolHandler` | 统一入口，支持自定义 action 类型 |

### 3.2 注册方式

```js
// ToolRegistry.registerTool(toolDef)
const tool = vscode.lm.registerTool(toolDef.name, {
    invoke: async (options, token) => {
        return await toolDef.handler(options, handlerContext, token);
    },
    prepareInvocation: async (options, _token) => {
        // 委托模式下不弹确认框
        if (delegateClient.getMode() !== 'local' && delegateClient.isConnected()) {
            return undefined;  // 跳过确认
        }
        // 本地模式弹出 VS Code 原生确认弹窗
        return {
            confirmationMessages: {
                title: '授权申请',
                message: `是否允许${toolDisplayName}？`
            }
        };
    }
});
```

**关键设计**：
- `prepareInvocation` 是 VS Code LM Tool 的前置钩子，在 `invoke` 之前调用
- 委托模式下跳过确认弹窗，由远端服务器处理用户交互
- 本地模式下弹出 VS Code 原生确认框（一次确认，不消耗计费）

---

## 4. 工具 Handler 调用链（本地模式）

### 4.1 `clarificationToolHandler`（request_user_clarification）

**文件**：`out/tools/clarificationTool.js`

```
clarificationToolHandler(options, context, token)
  ├── 提取 options.input: { question, context, placeholder }
  ├── 验证 question 非空
  ├── delegateClient.shouldDelegate()
  │     ├── true → delegateClient.invokeTool({ toolName, input })  [委托模式路径]
  │     └── false → 本地模式路径 ↓
  ├── webviewManager.requestClarification({
  │       question,
  │       context: inputContext,
  │       placeholder,
  │       toolName: 'request_user_clarification'
  │   })
  └── buildToolResultFromResponse(result, outputChannel)
        → vscode.LanguageModelToolResult([LanguageModelTextPart(result.text)])
```

### 4.2 `contactToolHandler`（request_contact_user）

**文件**：`out/tools/contactTool.js`

与 `clarificationToolHandler` 逻辑完全相同，只是 `toolName` 传入不同值。

```
contactToolHandler(options, context, token)
  └── webviewManager.requestClarification({
          question, context, placeholder,
          toolName: 'request_contact_user'
      })
  └── buildToolResultFromResponse(result)
```

### 4.3 `feedbackToolHandler`（request_user_feedback）

**文件**：`out/tools/feedbackTool.js`

```
feedbackToolHandler(options, context, token)
  └── webviewManager.requestClarification({
          question, context, placeholder,
          type: 'feedback',          // 区别：传了 type
          toolName: 'request_user_feedback'
      })
  └── buildToolResultFromResponse(result)
```

### 4.4 `dynamicActionToolHandler`（request_dynamic_action）

**文件**：`out/tools/dynamicActionTool.js`

```
dynamicActionToolHandler(options, context, token)
  ├── 提取 options.input: { action, params }
  ├── tryHandleWithAbilities(action, params, outputChannel)
  │     └── abilityRegistry.findAction(action) → 如果找到 ability 的 action，直接执行
  │           abilities 注册了：spawn-worker, ability-manage, proposal-helper
  ├── ACTION_CONFIG 映射:
  │     { clarification, contact, feedback } → 分别映射回对应 toolName
  │     未知 action → toolName = 'request_${action}'
  └── webviewManager.requestClarification({
          question: params.question,
          context: params.context,
          placeholder: params.placeholder,
          type: actionConfig.type,
          toolName: actionConfig.toolName
      })
```

**关键设计**：`dynamicActionTool` 是统一入口，LLM 可以通过 `action` 参数指定行为，而不需要知道底层工具名称。Ability 系统允许注册自定义能力扩展点（如 `spawn-worker`、`proposal-helper`）。

---

## 5. WebView 管理层：`ClarificationWebviewManager`

**文件**：`out/webviewManager.js`

### 5.1 核心方法：`requestClarification(request)`

```
requestClarification(request: {
    question: string,
    context?: string,
    placeholder?: string,
    type?: string,
    toolName: string
}): Promise<UserResponse>
  ├── requestId = generateRequestId()       // 'clarification-${Date.now()}-${random}'
  ├── panel = createWebviewPanel(request.type)
  │     └── vscode.window.createWebviewPanel(
  │               'humanClarification',
  │               '需要您的帮助',
  │               ViewColumn.Active or Beside,   // 由配置决定
  │               { enableScripts: true, retainContextWhenHidden: true }
  │           )
  ├── activeRequests.set(requestId, { panel, resolve, reject, request })
  ├── templates = templateLoader.loadTemplates(request.toolName)
  │     └── 根据 toolName 加载 configs/ 下对应模板 JSON
  │           clarification-templates.json | contact-templates.json | feedback-templates.json
  ├── panel.webview.html = viewLoader.loadViewContent(request, requestId, templates, panel)
  │     └── 读取 out/resources/views/chat/chat.html
  │     └── 注入 CONFIG_JSON（内含 question、context、requestId、templates 等）
  │     └── 替换 {{RESOURCES_PATH}} 模板变量 → webview URI
  ├── setupWebviewHandlers(panel, requestId)
  │     ├── panel.webview.onDidReceiveMessage(message => handleWebviewMessage(...))
  │     └── panel.onDidDispose(() => handlePanelDispose(requestId))
  └── return new Promise((resolve, reject) => ...)  // 挂起，等待 WebView 消息
```

**关键设计**：整个 `requestClarification` 调用会挂起（await Promise），直到用户在 WebView 中提交或取消。LLM 工具调用也会挂起等待。这就是"一次计费内完成多轮交互"的机制核心。

### 5.2 WebView 消息处理：`handleWebviewMessage`

WebView 可以向 extension host 发送多种消息类型：

| 消息类型 | 方向 | 说明 |
|---|---|---|
| `submit` | WebView → Extension | 用户提交回复，携带 `requestId` + `text` + `images` |
| `cancel` | WebView → Extension | 用户取消，携带 `requestId` |
| `getPromptFiles` | WebView → Extension | 请求本地 prompt 文件列表（`@` 触发） |
| `getTools` | WebView → Extension | 请求可用工具列表（`#` 触发） |
| `getWorkspaceFiles` | WebView → Extension | 请求工作区文件列表（文件选择器） |
| `getReplyTemplates` | WebView → Extension | 请求回复模板列表 |
| `readFileContent` | WebView → Extension | 请求读取文件内容（附件预览） |
| `openFile` | WebView → Extension | 请求在编辑器中打开文件 |

**extension 回应消息格式**（`panel.webview.postMessage`）：

```js
// 回应 getPromptFiles
{ type: 'promptFilesResponse', requestId, files: [...] }

// 回应 getTools
{ type: 'toolsResponse', requestId, tools: [...] }

// 回应 getWorkspaceFiles
{ type: 'workspaceFilesResponse', requestId, files: [...] }

// 回应 getReplyTemplates
{ type: 'replyTemplatesResponse', requestId, templates: [...] }

// 回应 readFileContent
{ type: 'fileContentResponse', requestId, filePath, content }
```

### 5.3 提交处理：`handleSubmit`

```
handleSubmit(message, request, requestId, panel)
  ├── response = {
  │       text: message.text || '',
  │       images: message.images || [],
  │       timestamp: Date.now(),
  │       reportContent: message.reportContent
  │   }
  ├── request.resolve(response)      // 解除 requestClarification 的 Promise 挂起
  ├── activeRequests.delete(requestId)
  └── panel.dispose()               // 关闭 WebView 面板
```

### 5.4 取消处理：`handleCancel`

```
handleCancel(request, requestId, panel)
  ├── request.reject(new Error('cancelled'))
  ├── activeRequests.delete(requestId)
  └── panel.dispose()
```

---

## 6. ToolResultBuilder：将 WebView 回复转为 LM 工具结果

**文件**：`out/tools/toolResultBuilder.js`

```
buildToolResultFromResponse(result, outputChannel)
  ├── if result.cancelled → buildCancelledToolResult()
  │     → new vscode.LanguageModelToolResult([
  │           new vscode.LanguageModelTextPart('{"cancelled": true, ...}')
  │       ])
  ├── parts = [new vscode.LanguageModelTextPart(result.text ?? '')]
  ├── for each image in result.images:
  │     ├── 解析 base64 data URL
  │     ├── 写入临时文件（os.tmpdir()）
  │     ├── parts.push(new vscode.LanguageModelDataPart(buffer, mimeType))
  │     └── setTimeout 60s 后清理临时文件
  └── return new vscode.LanguageModelToolResult(parts)
```

**关键设计**：返回 `vscode.LanguageModelToolResult` 后，VS Code 会将其传回 LLM，LLM 看到工具调用结果并继续推理。整个过程在单次用户输入的 LLM session 内完成，不消耗额外计费次数。

---

## 7. WebView 前端：`chat.html` + `chat.js`

**文件**：`out/resources/views/chat/chat.html`

### 7.1 HTML 结构

```html
<div class="container">
  <div class="question-section">     <!-- AI 提问区域 -->
    <div class="question-text" id="questionText"></div>
    <div class="context-text" id="contextText"></div>
  </div>
  <div class="input-section-sticky">
    <div class="tool-type-badge" id="toolTypeBadge"></div>  <!-- 工具类型标签 -->
    <div id="richInputContainer"></div>   <!-- 富文本输入框 -->
    <button id="cancelBtn">取消</button>
    <button id="submitBtn">提交</button>
  </div>
</div>
```

### 7.2 WebView JS 初始化流程

```
chat.js 加载
  ├── 读取 window.CONFIG（由 extension 注入的配置对象）
  │     CONFIG = {
  │         requestId,
  │         question,
  │         context,
  │         placeholder,
  │         toolName,
  │         serverInfo,
  │         replyTemplates,
  │         appendAttachmentContent
  │     }
  ├── 渲染 question 到 #questionText（支持 Markdown）
  ├── 渲染 context 到 #contextText（若有）
  ├── 初始化 RichInput 组件
  │     ├── 支持 @ 触发 prompt 文件搜索 → postMessage({ type: 'getPromptFiles' })
  │     ├── 支持 # 触发工具搜索 → postMessage({ type: 'getTools' })
  │     ├── 支持文件拖拽 → 读取文件内容 → postMessage({ type: 'readFileContent' })
  │     └── 支持图片粘贴 → base64 编码存储
  ├── submitBtn.click → 收集文本 + 图片
  │     └── vscode.postMessage({
  │               type: 'submit',
  │               requestId,
  │               text: input.getValue(),
  │               images: attachmentManager.getImages()
  │           })
  └── cancelBtn.click
        └── vscode.postMessage({ type: 'cancel', requestId })
```

---

## 8. 委托模式（Delegate Mode）：WebSocket 架构

**文件**：`out/delegate/delegateClient.js`  
**用途**：在 remote 开发环境中，将工具请求转发到本地 WebSocket 服务器，由本地服务器弹出 UI。

### 8.1 DelegateClient 架构

```
DelegateClient
  ├── 状态：ws（WebSocket 实例）、mode（local/delegate）、isConnecting、pendingToolRequests
  ├── autoConnectIfConfigured() → 启动时自动连接（mode !== 'local'）
  ├── shouldDelegate() → mode !== 'local' && isConnected()
  ├── invokeTool({ toolName, input })
  │     ├── ensureConnected('invokeTool')    // 确保 WebSocket 连接
  │     ├── requestId = 'delegate-${Date.now()}-${random}'
  │     ├── send({ type: 'tool.invoke', requestId, toolName, payload: {...} })
  │     ├── pendingToolRequests.set(requestId, { resolve, reject, timer, acked })
  │     ├── timer = setTimeout(() => retryToolInvoke(requestId), timeoutMs)
  │     └── return Promise  // 等待 tool.result 消息
  ├── 接收 WebSocket 消息:
  │     ├── { type: 'tool.ack' }    → pending.acked = true，重置 timer
  │     ├── { type: 'tool.result' } → pending.resolve(result)，clear timer
  │     └── { type: 'ping' }        → send({ type: 'pong' })
  └── retryToolInvoke(requestId) → 重发 tool.invoke（处理连接中断重连场景）
```

### 8.2 WebSocket 消息协议

**client → server**：
```json
{ "type": "tool.invoke", "requestId": "...", "toolName": "...", "payload": { "question": "...", "context": "...", "placeholder": "..." } }
{ "type": "tool.cancel", "requestId": "..." }
{ "type": "pong" }
```

**server → client**：
```json
{ "type": "tool.ack", "requestId": "..." }
{ "type": "tool.result", "requestId": "...", "result": { "text": "...", "images": [] } }
{ "type": "ping" }
```

---

## 9. HTTP API 服务器：`CopilotHttpServer`

**文件**：`out/server/httpServer.js`  
**用途**：将 VS Code LM API 暴露为 OpenAI 兼容的 HTTP API，供外部工具调用。

### 9.1 路由

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/` | 服务器状态 |
| GET | `/v1/models` | 列出可用 LM 模型（调用 `vscode.lm.selectChatModels()`） |
| POST | `/v1/chat/completions` | 调用 LM（调用 `vscode.lm.sendChatRequest()`） |

### 9.2 认证

```
Authorization: Bearer ${bearerToken}
```

若 `bearerToken` 为空则跳过认证。

---

## 10. 能力扩展系统：Abilities

**文件**：`out/abilities/index.js`

### 10.1 注册的 Abilities

| Ability | 用途 |
|---|---|
| `spawn-worker` | 在工作区中生成子 agent |
| `ability-manage` | 管理能力列表（读取 README 等） |
| `proposal-helper` | 任务提案管理（创建/列出/完成提案任务） |

### 10.2 调用链

```
dynamicActionTool 收到 action 参数
  → tryHandleWithAbilities(action, params, outputChannel)
      → abilityRegistry.findAction(action)
          → ability.actions[action](params, outputChannel)
              → 直接返回 vscode.LanguageModelToolResult（不经过 WebView）
```

---

## 11. 完整时序图：一次用户输入到多轮澄清

```
用户输入 → LLM 推理 → 调用 request_user_clarification
                          ↓
                   ToolRegistry.invoke()
                          ↓
                  clarificationToolHandler()
                          ↓
               shouldDelegate() = false（本地模式）
                          ↓
          webviewManager.requestClarification(request)
           ├── createWebviewPanel()
           ├── panel.webview.html = loadViewContent()
           └── return new Promise(...)  ← 挂起

用户在 WebView 中看到 AI 提问
用户填写回复 → submitBtn.click
         ↓
postMessage({ type: 'submit', requestId, text })
         ↓
handleWebviewMessage → handleSubmit
         ↓
request.resolve({ text, images })  ← 解除挂起
         ↓
buildToolResultFromResponse(result)
         ↓
返回 LanguageModelToolResult 给 LLM
         ↓
LLM 继续推理 → 可能再次调用工具
         ↓
webviewManager.requestClarification()  ← 再次挂起（第二轮澄清）
...（循环，整个过程在同一个 LLM session 内）
         ↓
LLM 最终输出结构化执行意图
```

**关键结论**：整个多轮澄清过程在 **单次用户高级请求** 内完成，不消耗额外次数。每次 WebView 提交只是工具调用结果，不触发新的 LLM 请求计费。

---

## 12. Remote/Local 双环境处理

### 12.1 判断远端环境

```js
const isRemote = typeof vscode.env.remoteName === 'string' && vscode.env.remoteName.length > 0;
```

### 12.2 文件操作的 remote 处理

```
handleOpenFile(message)
  ├── isRemote && isWindowsAbsolutePath
  │     → vscode.commands.executeCommand('humanClarification.openLocalFile', filePath, selection)
  │       （委托给 UI Helper 扩展处理本地文件）
  └── 其他情况
        → vscode.workspace.openTextDocument(uri) + showTextDocument(doc)
```

### 12.3 UI Helper 的职责

`justwe9517.human-clarification-ui-helper` 扩展只在 remote window 的 **UI 侧** 运行：

```
ui-helper activate()
  ├── if (!isRemote) → 跳过所有注册（避免与主扩展冲突）
  └── 注册命令：
        ├── humanClarification.getLocalPrompts  → 读取本地 ~/prompts/*.prompt.md
        ├── humanClarification.readLocalFile    → 读取本地文件内容
        ├── humanClarification.openLocalFile    → 在本地编辑器中打开文件
        └── humanClarification.hcInstall.installFromTemplate → 写入模板文件
```

---

## 13. 对 AgentILS 的启示

### 13.1 核心复用价值

1. **`vscode.lm.registerTool` + `prepareInvocation`**  
   是实现"工具触发前确认"的官方机制，不消耗计费。AgentILS 插件应按此模式注册 `new_task_request`、`approval_request`、`feedback_gate` 等工具。

2. **`requestClarification` 挂起 Promise 模式**  
   是"一次计费完成多轮 WebView 交互"的核心机制。AgentILS 插件的 WebView 面板应完全按此模式实现：工具 invoke 挂起 → WebView submit 解除挂起 → 返回给 LLM。

3. **WebView 双向消息协议**  
   `{ type: 'submit' | 'cancel' | 'getPromptFiles' | ... }` 的消息分发机制清晰，AgentILS 可以扩展消息类型到任务状态展示、风险确认、控制模式切换等。

4. **Delegate 架构（WebSocket）**  
   为将来 AgentILS 支持 remote workspace + 本机 UI 提供了完整参考。

### 13.2 AgentILS 与 human-clarification 的关键区别

| 维度 | human-clarification | AgentILS |
|---|---|---|
| 澄清状态机 | 插件内部（无状态，每次独立） | **AgentILS MCP Server**（有状态，task/phase 驱动） |
| 工具语义 | 通用问答 | task-scoped 状态推进 |
| WebView 内容 | 固定问题 + 文本输入 | 当前 taskCard + 风险 + 控制模式 + 结构化选项 |
| 多轮逻辑 | by LLM 自由决定调用次数 | by MCP 状态机决定推进步骤 |
| 完成判定 | LLM 自行判断 | verify + handoff + user confirmed 对齐 |

### 13.3 推荐的 AgentILS 插件实现方向

1. 保留 `vscode.lm.registerTool` 注册方式
2. Handler 内部：向 AgentILS MCP Server 发起状态查询 → 拿到当前 task 状态 → WebView 展示结构化状态
3. WebView 消息协议扩展：`{ type: 'task_approve' | 'task_feedback' | 'task_override' | ... }`
4. WebView 提交时不直接 resolve → 先通过 MCP tool 推进状态机 → 成功后再 resolve
5. Delegate 模式保留，指向 AgentILS 的 HTTP/WS 端点

---

## 14. 附录：文件结构速查

```
extension/out/
  extension.js                      # 插件激活入口
  webviewManager.js                 # WebView 生命周期管理
  tools/
    toolRegistry.js                 # LM tools 注册
    clarificationTool.js            # request_user_clarification handler
    contactTool.js                  # request_contact_user handler
    feedbackTool.js                 # request_user_feedback handler
    dynamicActionTool.js            # request_dynamic_action handler（统一入口）
    toolResultBuilder.js            # 构造 LanguageModelToolResult
    types.js                        # 工具类型定义
  delegate/
    delegateClient.js               # WebSocket 委托客户端
    types.js                        # 委托协议类型
  server/
    httpServer.js                   # OpenAI 兼容 HTTP API 服务器
  services/
    promptFileService.js            # 本地 prompt 文件搜索
    toolService.js                  # 可用工具列表
    workspaceFileService.js         # 工作区文件搜索
    taskManageService.js            # 任务文件管理（.hc/workflow/ 目录）
    historyService.js               # 历史记录（history.json）
  abilities/
    index.js                        # AbilityRegistry + tryHandleWithAbilities
    types.js                        # Ability 类型定义
    spawn-worker/                   # 生成子 agent ability
    ability-manage/                 # 能力管理 ability
    proposal-helper/                # 提案任务管理 ability
  webview/
    templateLoader.js               # 加载 configs/*.json 模板
    viewLoader.js                   # 加载并注入 HTML 模板
    types.js                        # WebView 类型定义
  hcInstall/
    templateLoader.js               # 安装模板加载器
  ui/
    localPrompts.js                 # 本地 Prompt 命令注册
  utils/
    openFile.js                     # 文件打开工具
  resources/
    views/chat/chat.html            # WebView 主 HTML 模板
    views/chat/chat.js              # WebView 前端逻辑
    views/chat/richInput/           # 富文本输入组件
    shared/                         # 共享 CSS/JS（markdown、katex、highlight）
  configs/
    clarification-templates.json    # 澄清回复模板
    contact-templates.json          # 联系用户回复模板
    feedback-templates.json         # 反馈回复模板
```

---

## 15. 【v2.0 新增】文档差异清单与修正

以下是 v1.0 文档与实际代码对比后发现的差异和遗漏：

### 15.1 工具注册数量差异

**v1.0 声称**：4 个 LM 工具（clarification、contact、feedback、dynamicAction）  
**实际代码**：**至少 12 个 LM 工具**（ToolRegistry.registerAll 中注册的全部工具）

| 工具名 | v1.0 已覆盖 | 实际存在 | Handler 文件 |
|---|---|---|---|
| `request_user_clarification` | ✅ | ✅ | `clarificationTool.js` |
| `request_contact_user` | ✅ | ✅ | `contactTool.js` |
| `request_user_feedback` | ✅ | ✅ | `feedbackTool.js` |
| `request_dynamic_action` | ✅ | ✅ | `dynamicActionTool.js` |
| `manage_todo_list` | ❌ 遗漏 | ✅ | `manageTodoListTool.js` |
| `write_report` | ❌ 遗漏 | ✅ | `writeReportTool.js` |
| `read_report` | ❌ 遗漏 | ✅ | `readReportTool.js` |
| `open_task_manage_webview` | ❌ 遗漏 | ✅ | `openTaskManageWebviewTool.js` |
| `test_image_api` | ❌ 遗漏 | ✅ | `testImageApiTool.js` |

### 15.2 服务层遗漏

v1.0 完全没有提及以下两个服务模块：

| 服务 | 职责 | 文件 |
|---|---|---|
| `TaskManageService` | 管理 `.hc/workflow/` 下的任务目录结构，列出/读取/归档任务文件 | `services/taskManageService.js` |
| `HistoryService` | 管理 `history.json` 交互历史（90 天保留策略，分页查询） | `services/historyService.js` |

### 15.3 WebView 子系统遗漏

v1.0 仅提到 `chat.js` 和 `richInput.js`，实际 RichInput 已被重构为独立子系统，包含 6 个模块化组件：

| 组件 | 文件 | 职责 |
|---|---|---|
| `RichInput` | `richInput/richInput.js` | 富文本输入核心（重构版） |
| `ChipManager` | `richInput/chipManager.js` | 标签管理（@ 触发 prompt 引用、# 触发工具引用） |
| `SuggestionManager` | `richInput/suggestionManager.js` | 自动补全建议弹窗 |
| `UndoManager` | `richInput/undoManager.js` | 撤销/重做栈 |
| `PasteHandler` | `richInput/pasteHandler.js` | 粘贴处理（图片 base64、富文本清理） |
| `AttachmentManager` | `richInput/attachmentManager.js` | 文件附件管理（添加/删除/渲染） |

### 15.4 Abilities 系统细节遗漏

v1.0 仅列出 3 个 ability 名称，实际 `proposal-helper` ability 包含 **10 个 action handler**：

| Action | Handler 文件 | 职责 |
|---|---|---|
| `createProposal` | `handlers/createProposal.js` | 创建新提案 |
| `listProposals` | `handlers/listProposals.js` | 列出所有提案 |
| `updateProposal` | `handlers/updateProposal.js` | 更新提案内容 |
| `deleteProposal` | `handlers/deleteProposal.js` | 删除提案 |
| `archiveProposal` | `handlers/archiveProposal.js` | 归档提案 |
| `addProposalTask` | `handlers/addProposalTask.js` | 为提案添加子任务 |
| `completeProposalTask` | `handlers/completeProposalTask.js` | 标记子任务完成 |
| `deleteTask` | `handlers/deleteTask.js` | 删除子任务 |
| `updateTask` | `handlers/updateTask.js` | 更新子任务 |
| `stagingQueries` | `handlers/stagingQueries.js` | 暂存区查询 |
| `taskQueries` | `handlers/taskQueries.js` | 任务查询 |

### 15.5 其他差异

1. **`webview-base.js`**：v1.0 未提及 `resources/shared/scripts/webview-base.js`，这是所有 WebView 的基础脚本（含 markdown-it、KaTeX 初始化）
2. **`feedbackTestCommand.js` / `writeReportTestCommand.js`**：开发调试用的测试命令，v1.0 未提及
3. **TaskManage WebView**：除了 `chat.html` 外，还有独立的 `taskManage/taskManage.html` + `taskManage.js` + `taskManage.css`，用于任务管理面板
4. **Feedback WebView**：`feedback/feedback.js` 提供独立的反馈视图

---

## 16. 【v2.0 新增】新增工具 Handler 详细分析

### 16.1 `manageTodoListToolHandler`（manage_todo_list）

**文件**：`out/tools/manageTodoListTool.js`  
**依赖**：`todoWriter.js`

```
manageTodoListToolHandler(options, context, token)
  ├── 提取 options.input: { operation, todoList, path }
  ├── 验证 operation ∈ { 'read', 'write' }
  ├── workspaceRoot = workspaceFolders[0].uri.fsPath
  ├── todoWriter = new TodoWriter()
  │
  ├── if operation == 'write':
  │     ├── 验证 todoList 是数组
  │     ├── 逐项验证：id（number）、title（string）、status（string）
  │     ├── todoWriter.writeTodos(workspaceRoot, todoList, path)
  │     │     └── 写入 .hc/todos/{filename}.json
  │     └── 返回 { success: true, path, todoId, items: count }
  │
  └── if operation == 'read':
        ├── todoWriter.readTodos(workspaceRoot, path)
        │     └── 读取 .hc/todos/{path}
        └── 返回 { success: true, todoList, count }
```

**关键设计**：
- TodoWriter 使用 `.hc/todos/` 目录存储，自动创建 `.gitignore`
- 支持自定义文件名或自动生成 `todos-{id}.json`
- JSON 格式持久化，结构为 `[{ id, title, status, ... }]`

### 16.2 `writeReportToolHandler`（write_report）

**文件**：`out/tools/writeReportTool.js`  
**依赖**：`reportWriter.js`

```
writeReportToolHandler(options, context, token)
  ├── 提取 options.input: { content, title }
  ├── 验证 content 非空
  ├── ReportWriter.writeReport(workspaceRoot, content, title)
  │     ├── 创建 .hc/reports/{year}/{month}/{day}/ 目录结构
  │     ├── 生成报告 ID：report-{timestamp}-{random}
  │     ├── 文件名：{sanitized-title}-{id}.md 或 report-{id}.md
  │     └── writeFileSync → 写入 Markdown 报告
  └── 返回 { write: true, path, reportId, fullPath }
```

**关键设计**：
- 按日期分层目录结构（年/月/日）
- 自动添加 `.gitignore` 到 `.hc/reports/`
- 无工作区时降级到系统临时目录

### 16.3 `readReportToolHandler`（read_report）

**文件**：`out/tools/readReportTool.js`

```
readReportToolHandler(options, context, token)
  ├── 提取 options.input: { path }
  ├── 解析路径（绝对路径直接用，相对路径基于 workspaceRoot 解析）
  ├── 检查文件存在性
  ├── readFileSync → 读取文件内容
  └── 直接返回文件内容（纯文本 LanguageModelTextPart）
```

**注意**：此工具直接返回文件原始内容，不包装为 JSON。

### 16.4 `openTaskManageWebviewToolHandler`（open_task_manage_webview）

**文件**：`out/tools/openTaskManageWebviewTool.js`

```
openTaskManageWebviewToolHandler(options, context, token)
  ├── 复用 webviewManager.requestClarification() 但传入 type: 'taskManage'
  │     └── WebView 加载 taskManage.html 而非 chat.html
  ├── 等待用户在 TaskManage WebView 中操作
  └── 返回用户操作结果
```

**关键设计**：
- 通过 `type: 'taskManage'` 切换 WebView 模板
- 复用了 WebviewManager 的 Promise 挂起机制
- TaskManage 视图展示 `.hc/workflow/` 目录下的任务列表

---

## 17. 【v2.0 新增】服务层详细分析

### 17.1 `TaskManageService`

**文件**：`out/services/taskManageService.js`

```
class TaskManageService {
  static listWorkspaceRoots()
    └── 返回 [{ name, path }] 列表
  
  static getWorkflowRoot(workspaceRoot)
    └── 返回 path.join(workspaceRoot, '.hc', 'workflow')
  
  static async listTasks(workspaceRoot)
    ├── 遍历 .hc/workflow/ 下的目录
    ├── 匹配模式 /^(\d{3})-(.+)$/（如 001-setup-auth）
    └── 返回 [{ id, slug, dirName, fullPath, mtimeMs }]
  
  static async getTaskArtifacts(workspaceRoot, taskDir)
    ├── 路径安全校验（isPathWithin）
    └── 返回任务目录下的文件列表
}
```

**关键设计**：
- 任务目录命名约定：`{3位序号}-{slug}`（如 `001-refactor-auth`、`002-add-tests`）
- 包含路径遍历防护（`isPathWithin` 校验）

### 17.2 `HistoryService`

**文件**：`out/services/historyService.js`

```
class HistoryService {
  static RETENTION_DAYS = 90
  static DEFAULT_PAGE_SIZE = 20
  
  static async getHistoryFileUri(context)
    └── 返回 storageUri/history.json 的 URI
  
  static async addEntry(context, entry: { toolName, question, response, timestamp })
    ├── readHistoryFile()
    ├── pruneEntries() → 清除超过 90 天的条目
    ├── entries.push(newEntry)
    └── writeHistoryFile()
  
  static async getEntries(context, page?, pageSize?)
    ├── readHistoryFile()
    ├── pruneEntries()
    └── 返回分页结果 { entries, total, page, pageSize }
}
```

**关键设计**：
- 使用 VS Code 的 `context.storageUri`（工作区级别）或 `context.globalStorageUri`（全局级别）
- 90 天自动清理策略
- 支持分页查询

---

## 18. 【v2.0 新增】RichInput 子系统详解

### 18.1 架构

RichInput 已从单文件重构为模块化子系统，位于 `resources/views/chat/richInput/` 目录：

```
richInput/
  richInput.js          # 核心输入组件（contenteditable div）
  chipManager.js        # 标签芯片管理（@prompt、#tool 引用）
  suggestionManager.js  # 自动补全建议弹窗
  undoManager.js        # 撤销/重做操作栈
  pasteHandler.js       # 粘贴事件处理
  attachmentManager.js  # 文件附件管理
```

### 18.2 ChipManager

```
class ChipManager {
  addChip(type, label, data)
    ├── 创建 <span class="chip" data-type="{type}"> 元素
    ├── 插入到 contenteditable 中
    └── 触发 onChange 回调
  
  removeChip(chipElement)
    └── 从 DOM 移除并更新内部状态
  
  getChips()
    └── 返回所有 [{ type, label, data }]
}
```

**Chip 类型**：
- `@` 前缀触发 → Prompt 文件引用 → `{ type: 'prompt', label: '@xxx.prompt.md', data: { path } }`
- `#` 前缀触发 → 工具引用 → `{ type: 'tool', label: '#toolName', data: { toolName } }`

### 18.3 SuggestionManager

```
class SuggestionManager {
  show(items, position)
    ├── 渲染建议弹窗
    ├── 键盘导航（↑↓回车选中）
    └── 鼠标点击选中
  
  select(item)
    ├── 触发 onSelect 回调
    └── 隐藏弹窗
}
```

### 18.4 AttachmentManager

```
class AttachmentManager {
  attachFile(path, name)
    ├── 添加到 attachedFiles 数组
    └── 渲染附件面板（显示文件名 + 删除按钮）
  
  removeAttachment(index)
    └── 从数组移除并重新渲染
  
  getAll()
    └── 返回 [{ path, name }]
}
```

---

## 19. 【v2.0 新增】Abilities 系统 proposal-helper 详解

### 19.1 AbilityRegistry 架构

```
class DefaultAbilityRegistry {
  abilities: Map<string, Ability>
  
  register(ability)       → abilities.set(name, ability)
  findAction(actionName)  → 遍历所有 ability 的 actions，找到匹配的 handler
}

// 注册顺序
abilityRegistry.register(spawnWorkerAbility)
abilityRegistry.register(abilityManageAbility)
abilityRegistry.register(proposalHelperAbility)
```

### 19.2 spawn-worker Ability

- **actions**: `{ spawnWorker: (params, outputChannel) => ... }`
- **功能**：在工作区中生成子 agent（通过在指定目录写入 agent 配置文件来触发）

### 19.3 ability-manage Ability

- **actions**: `{ listAbilities: ..., getAbilityInfo: ... }`
- **功能**：列出所有注册的 ability 和它们的 README 信息

### 19.4 proposal-helper Ability 完整 Actions

```
proposalHelperAbility = {
  name: 'proposal-helper',
  actions: {
    createProposal(params)         → 创建 .hc/proposals/{id}/ 目录 + proposal.json
    listProposals(params)          → 列出所有提案（含状态过滤）
    updateProposal(params)         → 更新提案 JSON
    deleteProposal(params)         → 删除提案目录
    archiveProposal(params)        → 移入 .hc/proposals/archived/
    addProposalTask(params)        → 在提案下添加子任务
    completeProposalTask(params)   → 标记子任务完成
    deleteTask(params)             → 删除子任务
    updateTask(params)             → 更新子任务
    stagingQueries(params)         → 查询暂存区任务
    taskQueries(params)            → 查询任务状态
  }
}
```

---

## 20. 【v2.0 新增】TaskManage WebView 详解

**文件**：`out/resources/views/taskManage/taskManage.html` + `taskManage.js` + `taskManage.css`

### 20.1 功能

TaskManage WebView 是一个独立于 Chat WebView 的面板，用于：
- 展示 `.hc/workflow/` 目录下的所有任务
- 按序号排列任务列表
- 查看任务详情和产物
- 对任务进行操作（打开、归档等）

### 20.2 与 Chat WebView 的区别

| 维度 | Chat WebView | TaskManage WebView |
|---|---|---|
| 触发方式 | 工具调用弹出 | `open_task_manage_webview` 工具触发 |
| 模板 | `chat.html` | `taskManage.html` |
| 交互模式 | 问答式（提问→回答→提交） | 列表式（浏览→选择→操作） |
| Promise 挂起 | 提交时 resolve | 操作时 resolve |

---

## 21. 【v2.0 新增】已发现的设计问题

### 21.1 严重问题

| # | 问题 | 影响 | 建议 |
|---|---|---|---|
| 1 | **请求超时缺失** | `requestClarification()` 挂起的 Promise 永不超时，如果用户不操作，LM 工具调用会永久挂起 | 添加 `Promise.race([request, timeout(30s)])` |
| 2 | **图片临时文件泄漏** | `toolResultBuilder` 中 `setTimeout(60000, () => unlinkSync(tmpFile))`，如果进程在 60s 内崩溃，临时文件不会被清理 | 改用 `os.tmpdir()` + 启动时清理，或使用内存 Buffer |
| 3 | **deactivate 不完整** | `deactivate()` 仅调用 `delegateClient.disconnect()`，未关闭 `CopilotHttpServer` | 补充 `httpServer.stop()` |

### 21.2 中等问题

| # | 问题 | 影响 | 建议 |
|---|---|---|---|
| 4 | **硬编码中文字符串** | 确认弹窗标题 `'授权申请'`、按钮 `'需要您的帮助'` 等直接硬编码 | 抽取到 `nls.json` 或 `vscode.l10n` |
| 5 | **无错误恢复** | DelegateClient 连接断开后仅尝试一次重连 | 添加指数退避重连策略 |
| 6 | **HistoryService 无并发保护** | 多个工具同时写 `history.json` 可能数据丢失 | 添加文件锁或写入队列 |

### 21.3 轻微问题

| # | 问题 | 影响 | 建议 |
|---|---|---|---|
| 7 | **ReportWriter 路径安全** | `sanitizeFilename()` 实现未完整审计，可能存在路径遍历风险 | 加强文件名清理（禁止 `..`、`/` 等） |
| 8 | **RichInput 旧版残留** | 同时存在 `richInput.js` 和 `richInput.old.js` | 清理旧版文件 |

---

## 22. 【v2.0 新增】完整文件结构速查（更新版）

```
extension/out/
  extension.js                      # 插件激活入口
  webviewManager.js                 # WebView 生命周期管理（Chat/TaskManage/Feedback 三种视图）
  
  tools/
    toolRegistry.js                 # LM tools 注册（12+ 工具）
    clarificationTool.js            # request_user_clarification handler
    contactTool.js                  # request_contact_user handler
    feedbackTool.js                 # request_user_feedback handler
    dynamicActionTool.js            # request_dynamic_action handler（统一入口）
    manageTodoListTool.js           # manage_todo_list handler  【v2.0 新增】
    writeReportTool.js              # write_report handler      【v2.0 新增】
    readReportTool.js               # read_report handler       【v2.0 新增】
    openTaskManageWebviewTool.js    # open_task_manage_webview handler  【v2.0 新增】
    testImageApiTool.js             # test_image_api handler    【v2.0 新增】
    toolResultBuilder.js            # 构造 LanguageModelToolResult
    reportWriter.js                 # 报告写入器（.hc/reports/）  【v2.0 新增】
    todoWriter.js                   # Todo 写入器（.hc/todos/）   【v2.0 新增】
    feedbackTestCommand.js          # 开发调试用测试命令  【v2.0 新增】
    writeReportTestCommand.js       # 开发调试用测试命令  【v2.0 新增】
    types.js                        # 工具类型定义
  
  delegate/
    delegateClient.js               # WebSocket 委托客户端
    types.js                        # 委托协议类型
  
  server/
    httpServer.js                   # OpenAI 兼容 HTTP API 服务器
  
  services/
    promptFileService.js            # 本地 prompt 文件搜索
    toolService.js                  # 可用工具列表
    workspaceFileService.js         # 工作区文件搜索
    taskManageService.js            # 任务文件管理（.hc/workflow/）  【v2.0 新增】
    historyService.js               # 历史记录（history.json，90天保留）  【v2.0 新增】
  
  abilities/
    index.js                        # AbilityRegistry + tryHandleWithAbilities
    types.js                        # Ability 类型定义
    spawn-worker/
      index.js                      # 子 agent 生成 ability
      handlers/
        spawnWorker.js              # spawnWorker action handler
        index.js                    # handler 导出
      README.js                     # ability 文档
    ability-manage/
      index.js                      # 能力管理 ability
      README.js                     # ability 文档
    proposal-helper/                        【v2.0 新增详细分析】
      index.js                      # 提案管理 ability（10+ actions）
      README.js                     # ability 文档
      handlers/
        index.js                    # handler 导出聚合
        createProposal.js           # 创建提案
        listProposals.js            # 列出提案
        updateProposal.js           # 更新提案
        deleteProposal.js           # 删除提案
        archiveProposal.js          # 归档提案
        addProposalTask.js          # 添加子任务
        completeProposalTask.js     # 完成子任务
        deleteTask.js               # 删除子任务
        updateTask.js               # 更新子任务
        stagingQueries.js           # 暂存区查询
        taskQueries.js              # 任务查询
  
  webview/
    templateLoader.js               # 加载 configs/*.json 模板
    viewLoader.js                   # 加载并注入 HTML 模板
    types.js                        # WebView 类型定义
  
  hcInstall/
    templateLoader.js               # 安装模板加载器
  
  ui/
    localPrompts.js                 # 本地 Prompt 命令注册
  
  utils/
    openFile.js                     # 文件打开工具
  
  resources/
    views/
      chat/
        chat.html                   # WebView 主 HTML 模板
        chat.js                     # WebView 前端逻辑（入口）
        chat.css                    # 样式
        richInput.js                # 富文本输入（旧版，已废弃）
        richInput.old.js            # 富文本输入（更旧版）
        richInput.css               # 富文本样式
        chipManager.js              # 标签芯片管理（旧版入口）
        suggestionManager.js        # 建议管理（旧版入口）
        pasteHandler.js             # 粘贴处理（旧版入口）
        htmlToMarkdown.js           # HTML 转 Markdown
        undoManager.js              # 撤销管理（旧版入口）
        attachmentManager.js        # 附件管理   【v2.0 新增】
        richInput/                              【v2.0 新增】
          richInput.js              # 重构版富文本输入核心
          chipManager.js            # 重构版标签芯片管理
          suggestionManager.js      # 重构版建议管理
          undoManager.js            # 重构版撤销管理
          pasteHandler.js           # 重构版粘贴处理
          attachmentManager.js      # 重构版附件管理
          richInput.css             # 重构版样式
      feedback/
        feedback.js                 # 反馈视图   【v2.0 新增】
      taskManage/                               【v2.0 新增】
        taskManage.html             # 任务管理 HTML
        taskManage.js               # 任务管理前端逻辑
        taskManage.css              # 任务管理样式
    shared/
      styles/
        common.css                  # 通用样式
        katex.min.css               # KaTeX 数学公式样式
        highlight-github-dark.min.css  # 代码高亮样式
      scripts/
        webview-base.js             # WebView 基础脚本  【v2.0 新增】
        markdown-it.min.js          # Markdown 渲染
        markdown-it-katex.min.js    # KaTeX 插件
        katex.min.js                # KaTeX 引擎
        highlight.min.js            # 代码高亮
  
  configs/
    clarification-templates.json    # 澄清回复模板
    contact-templates.json          # 联系用户回复模板
    feedback-templates.json         # 反馈回复模板
  
  sample-prompts/                               【v2.0 新增】
    human-clarification.agent.md    # 示例 agent 模板
    human-clarification.prompt.md   # 示例 prompt 模板
```
