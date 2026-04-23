# human-clarification vsix 完整调用链路分析

版本：v3.0（重写）
来源：`justwe9517.human-clarification-1.3.3.vsix` 的工作区缓存源码
日期：2026-04-23
v2.0 → v3.0 变更：v2.0 存在多处与实际源码不符的描述（详见 §16），v3.0 完全重写并以源码为准。

> **文档边界**：本文只描述 vsix 的实际行为，不包含 AgentILS 复刻方案（另起 `agentils-human-clarification-impl-plan.md`）。

---

## 0. 阅读前提示

本文按**模块 → 函数调用**两层组织。每个模块只描述真实存在并被运行时引用的代码；存在于源码树但未被任何代码引用的"孤儿模块"在 §15 单独列出，避免与运行链路混淆。

---

## 1. 整体架构

```
用户在 Copilot Chat 输入提示词
        ↓
LLM 决策：调用 4 个 LM tool 之一
        ↓
vscode.lm.registerTool(...).invoke(options, token)
        ↓
ToolRegistry.registerAll() 中绑定的 toolHandler
        ↓
    ┌──────────────────────────────────────────┐
    │       prepareInvocation 前置确认          │
    │  delegate 模式（已连接） → 跳过确认弹窗   │
    │  local 模式             → "授权申请"弹窗 │
    └──────────────────────────────────────────┘
        ↓
    ┌──────────────────────────────────────────┐
    │  DelegateClient.shouldDelegate() 分流    │
    │  true  → delegateClient.invokeTool()     │
    │  false → webviewManager.requestClarification() │
    └──────────────────────────────────────────┘
        ↓ （local）                       ↓ （delegate）
   创建 WebView + 挂起 Promise        WebSocket 转发到远端 + 挂起 Promise
        ↓                               ↓
   用户在 WebView 提交               远端服务器返回 tool.result
        ↓                               ↓
   handleSubmit → resolve            ws.onmessage → resolve
        ↓
   buildToolResultFromResponse(result)
        → vscode.LanguageModelToolResult([LanguageModelTextPart, LanguageModelDataPart...])
        ↓
   返回给 LLM → 同一会话继续推理（不消耗额外计费）
```

**关键设计**：整个挂起-提交闭环在单次 LLM 工具调用内完成，因此可以在一次"高级请求"内完成多轮人机交互。

---

## 2. 激活入口：`activate(context)`

**文件**：[`extension.js`](#file-extension-js)
**激活时机**：`onStartupFinished`

```
activate(context)
  ├── outputChannel = vscode.window.createOutputChannel('Human Clarification')
  ├── webviewManager = new ClarificationWebviewManager(context)
  ├── delegateClient = new DelegateClient(context, outputChannel)
  │     └── context.subscriptions.push(delegateClient)   ← 由 VS Code 自动 dispose
  ├── toolRegistry = new ToolRegistry(context, { webviewManager, outputChannel, delegateClient })
  │     └── toolRegistry.registerAll()                   ← 注册 4 个 LM tools
  ├── 注册 3 个 delegate 命令：
  │     • humanClarification.delegate.toggle
  │     • humanClarification.delegate.statusBarMenu
  │     • humanClarification.delegate.testConnection
  ├── registerFeedbackTestCommand(context, webviewManager)   ← 开发调试命令
  ├── vscode.chat.createChatParticipant('human-clarification.hc', handler)
  │     └── 处理 "@hc /install"：调用 loadHcInstallTemplate() + executeCommand('humanClarification.hcInstall.installFromTemplate', template)
  ├── httpServer = new CopilotHttpServer(outputChannel)
  ├── 注册 3 个 server 命令：start / stop / toggle
  ├── httpServer.autoStartIfConfigured()
  ├── delegateClient.autoConnectIfConfigured()
  └── registerLocalPrompts(context)                      ← UI-side 本地 prompt 命令

deactivate()
  └── if (httpServer) { httpServer.dispose(); httpServer = null }
       // delegateClient 已通过 context.subscriptions 自动 dispose
```

---

## 3. LM Tool 注册：`ToolRegistry`

**文件**：`out/tools/toolRegistry.js`

### 3.1 注册的工具（共 **4 个**，与 `package.json#contributes.languageModelTools` 一一对应）

| 工具名 | Handler | toolReferenceName | 用途 |
|---|---|---|---|
| `request_user_clarification` | `clarificationToolHandler` | `requestUserClarification` | 向用户提问澄清 |
| `request_contact_user` | `contactToolHandler` | `requestContactUser` | 主动联系用户 |
| `request_user_feedback` | `feedbackToolHandler` | `requestUserFeedback` | 任务后收集反馈 |
| `request_dynamic_action` | `dynamicActionToolHandler` | `requestDynamicAction` | 统一入口（`action` + `params`） |

> **重要**：源码树 `out/tools/` 下还存在 `manageTodoListTool.js` / `writeReportTool.js` / `readReportTool.js` / `openTaskManageWebviewTool.js` / `testImageApiTool.js` 五个文件，但 `toolRegistry.js` 的 `TOOL_DEFINITIONS` 数组**未导入**它们，全仓 grep 也无任何引用。它们是孤儿/未启用代码，详见 §15。

### 3.2 `prepareInvocation` 行为

```js
prepareInvocation: needsConfirmation ? async (options, _token) => {
  const mode = delegateClient.getMode();
  if (mode !== 'local' && delegateClient.isConnected()) {
    return undefined;            // delegate 已连接 → 不弹确认（远端服务器负责审批）
  }
  return {
    confirmationMessages: {
      title: '授权申请',
      message: `是否允许${toolDisplayName}？`   // 中文文案硬编码
    }
  };
} : undefined
```

`needsConfirmation` 对全部 4 个工具都为 `true`，即任何工具调用在本地模式下都会先弹一次"授权申请"。一次确认后才执行 `invoke`，且不消耗额外 LLM 计费。

---

## 4. Tool Handlers

### 4.1 `clarificationToolHandler` / `contactToolHandler`

两者结构一致：

```
handler(options, { webviewManager, outputChannel, delegateClient }, token)
  ├── { question, context, placeholder } = options.input
  ├── 校验 question 非空
  ├── if (await delegateClient.shouldDelegate())
  │     ├── result = await delegateClient.invokeTool({ toolName, input: { question, context, placeholder } })
  │     └── return buildToolResultFromResponse(result, outputChannel)
  ├── result = await webviewManager.requestClarification({
  │       question, context, placeholder,
  │       toolName: 'request_user_clarification' | 'request_contact_user'
  │   })
  └── return buildToolResultFromResponse(result, outputChannel)
```

`contactToolHandler` 与 `clarificationToolHandler` 唯一差异是 `toolName`，没有传 `type`。

### 4.2 `feedbackToolHandler`

与上面相同，但传入 `type: 'feedback'`。`webviewManager` 据此可以挑选不同的 UI 模板（实际目前 chat.html 通用，feedback 主要影响 `tool-type-badge` 文案与 `templateLoader` 选择哪份 `*-templates.json`）。

### 4.3 `dynamicActionToolHandler`

```
handler(options, { webviewManager, outputChannel, delegateClient }, token)
  ├── { action, params } = options.input
  ├── 校验 action 非空
  ├── 1) 优先走 abilities：
  │     abilityResult = tryHandleWithAbilities(action, params || {}, outputChannel)
  │     if (abilityResult) return abilityResult       // ability 直接返回 LM 结果，不走 WebView
  ├── 2) 走 ACTION_CONFIG（仅 clarification / contact / feedback 三个 action 命中）：
  │     actionConfig = ACTION_CONFIG[action] || { toolName: `request_${action}`, ... }
  ├── 3) 校验 params.question 非空
  ├── 4) 同样走 delegate / webview 分流
  └── 5) buildToolResultFromResponse(result)
```

`ACTION_CONFIG` 只声明了 3 个内置 action：

```js
const ACTION_CONFIG = {
  clarification: { toolName: 'request_user_clarification', logPrefix: 'Clarification' },
  contact:       { toolName: 'request_contact_user',       logPrefix: 'Contact' },
  feedback:      { toolName: 'request_user_feedback', type: 'feedback', logPrefix: 'Feedback' }
};
```

未知 action 名会**默认 fallback** 为 `toolName = 'request_${action}'` 并继续走 webview 流程，意味着任何字符串都会触发一次澄清弹窗。

---

## 5. WebView 管理：`ClarificationWebviewManager`

**文件**：`out/webviewManager.js`

### 5.1 `requestClarification(request)`（核心挂起方法）

```
requestClarification(request: { question, context?, placeholder?, type?, toolName }): Promise<UserResponse>
  ├── requestId = `clarification-${Date.now()}-${random}`
  ├── panel = vscode.window.createWebviewPanel(
  │       'humanClarification', '需要您的帮助',
  │       ViewColumn.Active | ViewColumn.Beside,    // 由 humanClarification.webview.viewColumn 配置决定
  │       { enableScripts: true, retainContextWhenHidden: true }
  │   )
  ├── activeRequests.set(requestId, { panel, resolve, reject, request })
  ├── templates = templateLoader.loadTemplates(request.toolName)
  │     └── 读取 configs/{clarification|contact|feedback}-templates.json
  │     └── 合并用户配置 humanClarification.templates.{global|clarification|contact|feedback}
  ├── panel.webview.html = viewLoader.loadViewContent(request, requestId, templates, panel)
  │     └── 读取 out/resources/views/chat/chat.html
  │     └── 注入 CONFIG_JSON（question / context / requestId / templates / serverInfo / replyTemplates / appendAttachmentContent）
  │     └── 把 {{RESOURCES_PATH}} 替换为 webview.asWebviewUri(...)
  ├── panel.webview.onDidReceiveMessage(msg => handleWebviewMessage(msg, request, requestId, panel))
  ├── panel.onDidDispose(() => handlePanelDispose(requestId))     // 用户关闭面板视为取消
  └── return new Promise((resolve, reject) => ...)                 // ← 挂起，由 handleSubmit/handleCancel 解除
```

### 5.2 WebView ↔ Extension 消息协议

WebView → Extension：

| `type` | 说明 | 必带字段 |
|---|---|---|
| `submit` | 用户提交回复 | `requestId`, `text`, `images?`, `reportContent?` |
| `cancel` | 用户取消 | `requestId` |
| `getPromptFiles` | 请求本地 `*.prompt.md` 列表（`@` 触发） | `requestId` |
| `getTools` | 请求可用工具列表（`#` 触发） | `requestId` |
| `getWorkspaceFiles` | 请求工作区文件列表 | `requestId` |
| `getReplyTemplates` | 请求回复模板列表 | `requestId` |
| `readFileContent` | 读取文件内容（附件预览） | `requestId`, `filePath` |
| `openFile` | 在编辑器中打开文件 | `filePath`, `selection?` |

Extension → WebView：

| `type` | 字段 |
|---|---|
| `promptFilesResponse` | `requestId`, `files: [{ name, path, ... }]` |
| `toolsResponse` | `requestId`, `tools: [{ name, ... }]` |
| `workspaceFilesResponse` | `requestId`, `files: [...]` |
| `replyTemplatesResponse` | `requestId`, `templates: [...]` |
| `fileContentResponse` | `requestId`, `filePath`, `content` |

### 5.3 `handleSubmit` / `handleCancel`

```
handleSubmit(message, request, requestId, panel)
  ├── response = { text: msg.text || '', images: msg.images || [], reportContent: msg.reportContent, timestamp: Date.now() }
  ├── activeRequests.get(requestId).resolve(response)     ← 解除 §5.1 的 Promise
  ├── activeRequests.delete(requestId)
  └── panel.dispose()

handleCancel(request, requestId, panel)
  ├── activeRequests.get(requestId).reject(new Error('cancelled'))
  ├── activeRequests.delete(requestId)
  └── panel.dispose()
```

`'cancelled'` 错误会在 handler 中被识别并转换为 `buildCancelledToolResult()`，避免错误冒泡到 LLM 端。

---

## 6. 工具结果构造：`toolResultBuilder`

**文件**：`out/tools/toolResultBuilder.js`

```
buildToolResultFromResponse(result, outputChannel)
  ├── if (result.cancelled) return buildCancelledToolResult()
  │     → new vscode.LanguageModelToolResult([
  │           new vscode.LanguageModelTextPart('{"cancelled": true, "message":"User cancelled the operation"}')
  │       ])
  ├── parts = [new vscode.LanguageModelTextPart(result.text ?? '')]
  ├── for image in result.images:
  │     ├── 解析 data URL → buffer
  │     ├── 写入 os.tmpdir() 临时文件（用于必要时本地预览）
  │     ├── parts.push(new vscode.LanguageModelDataPart(buffer, mimeType))
  │     └── setTimeout(60_000, () => unlinkSync(tmpFile))   // 60s 后清理临时文件
  └── return new vscode.LanguageModelToolResult(parts)
```

**已知风险**：

- 如果进程在 60s 内崩溃，临时文件不会被清理。
- 大量图片会占内存（buffer + DataPart 同时持有）。

---

## 7. 委托模式：`DelegateClient`（WebSocket）

**文件**：`out/delegate/delegateClient.js`

### 7.1 配置项（前缀 `humanClarification.delegate.*`）

| key | 类型 | 默认 | 说明 |
|---|---|---|---|
| `mode` | `'local' | 'delegate'` | `'local'` | 切换运行模式 |
| `serverAddress` | `string` | `''` | `host:port`，例 `127.0.0.1:8787` |
| `useTls` | `boolean` | `false` | `false` → `ws://`，`true` → `wss://` |
| `tenantId` | `string` | `''` | 租户标识 |
| `clientName` | `string` | `''` | 客户端显示名 |
| `timeoutMs` | `number` | `30000` | tool.ack 超时；超时后提示并重试，**不回退本地** |

### 7.2 `invokeTool({ toolName, input })`

```
invokeTool({ toolName, input })
  ├── await ensureConnected('invokeTool')
  ├── requestId = `delegate-${Date.now()}-${random}`
  ├── send({ type: 'tool.invoke', requestId, toolName, payload: input })
  ├── pendingToolRequests.set(requestId, { resolve, reject, timer, acked: false })
  ├── timer = setTimeout(() => retryToolInvoke(requestId), timeoutMs)
  └── return new Promise((resolve, reject) => ...)
```

### 7.3 WebSocket 消息协议

Client → Server：
```json
{ "type": "tool.invoke", "requestId": "...", "toolName": "...", "payload": { "question": "...", "context": "...", "placeholder": "..." } }
{ "type": "tool.cancel", "requestId": "..." }
{ "type": "pong" }
```

Server → Client：
```json
{ "type": "tool.ack",    "requestId": "..." }
{ "type": "tool.result", "requestId": "...", "result": { "text": "...", "images": [...] } }
{ "type": "ping" }
```

`tool.ack` 收到后将 `acked = true` 并刷新 timer；超时未收到 `tool.ack` 则触发 `retryToolInvoke`（重发 `tool.invoke`）。

### 7.4 关键不变量

- `shouldDelegate()` ≡ `mode !== 'local' && isConnected()`。
- delegate 已连接时，`prepareInvocation` 不弹本地确认弹窗。
- 一旦 `mode === 'delegate'` 但连接断开，工具调用会**走 await ensureConnected → 重连**，不会回退到本地 WebView。

---

## 8. HTTP API 服务器：`CopilotHttpServer`

**文件**：`out/server/httpServer.js`
**用途**：把 VS Code Language Model API 包装为 OpenAI 兼容 HTTP，供外部程序复用 Copilot 配额。

### 8.1 路由

| Method | Path | 说明 |
|---|---|---|
| GET | `/` | 服务器状态 |
| GET | `/v1/models` | `vscode.lm.selectChatModels()` 列出模型 |
| POST | `/v1/chat/completions` | 调 `vscode.lm.sendChatRequest()`，转换为 OpenAI 风格 SSE/JSON |

### 8.2 鉴权

`Authorization: Bearer ${humanClarification.server.bearerToken}`，未配置则跳过鉴权（仅监听本机时一般可接受）。

---

## 9. Abilities 系统

**文件**：`out/abilities/index.js`

### 9.1 注册方式

```js
abilityRegistry.register(spawnWorkerAbility);
abilityRegistry.register(abilityManageAbility);
abilityRegistry.register(proposalHelperAbility);

function tryHandleWithAbilities(action, params, outputChannel) {
  const found = abilityRegistry.findAction(action);
  if (found) return found.handler(params, outputChannel);   // 直接返回 LanguageModelToolResult
  return undefined;
}
```

`dynamicActionToolHandler` 在走 webview 之前先调 `tryHandleWithAbilities`，命中则直接返回 LM 结果，绕过 WebView。

### 9.2 各 ability 的 actions

| Ability | 实际 actions（来自 index.js） |
|---|---|
| `spawn-worker` | `spawnWorker` |
| `ability-manage` | `readAbility` |
| `proposal-helper` | `addProposalTask`, `createProposal`, `completeProposalTask`, `getNextTask`, `getPendingTasks`, `getTask`, `updateTask`, `deleteTask`, `listStagedTasks`, `clearStagedTasks`, `listProposals`, `deleteProposal`, `updateProposal`, `archiveProposal`, `listArchivedProposals`, `unarchiveProposal` |

`proposal-helper` 共 16 个 actions，每个 handler 是 `handlers/{actionName}.js` 的导出函数；写入位置约定为 `.hc/proposals/`。

---

## 10. WebView 前端

### 10.1 实际存在的视图（`out/resources/views/`）

只有 **`chat/`** 一个子目录。源码树**不存在** `feedback/` 或 `taskManage/` 子目录（v2.0 文档曾错误声称存在）。

### 10.2 `chat/` 目录结构

```
out/resources/views/chat/
  chat.html              # WebView HTML 模板
  chat.js                # 入口脚本（消费 window.CONFIG）
  chat.css               # 样式
  htmlToMarkdown.js      # 粘贴时 HTML → Markdown 转换
  attachmentManager.js   # 附件管理（顶层旧版入口）
  chipManager.js         # 标签芯片（旧版入口）
  pasteHandler.js        # 粘贴处理（旧版入口）
  suggestionManager.js   # 建议弹窗（旧版入口）
  undoManager.js         # 撤销栈（旧版入口）
  richInput.js           # 富文本输入（旧版）
  richInput.old.js       # 富文本输入（更老版本，已废弃但仍打包）
  richInput.css          # 富文本样式
  richInput/             # 重构后的模块化子系统（运行时实际加载）
    richInput.js
    chipManager.js
    suggestionManager.js
    undoManager.js
    pasteHandler.js
    attachmentManager.js
    richInput.css
```

### 10.3 chat.js 初始化流程

```
chat.js 加载
  ├── 读取 window.CONFIG（由 viewLoader 注入）
  │     CONFIG = { requestId, question, context, placeholder, toolName, serverInfo, replyTemplates, appendAttachmentContent }
  ├── 渲染 question / context（支持 markdown + path#L10 链接化）
  ├── 初始化 RichInput
  │     ├── @ 触发 → postMessage({ type: 'getPromptFiles' })
  │     ├── # 触发 → postMessage({ type: 'getTools' })
  │     ├── 拖拽文件 → postMessage({ type: 'readFileContent' })
  │     └── 粘贴图片 → base64 编码缓存
  ├── submitBtn.click → postMessage({ type: 'submit', requestId, text, images })
  └── cancelBtn.click → postMessage({ type: 'cancel', requestId })
```

---

## 11. 共享资源

`out/resources/shared/` 提供：

- `styles/`：`common.css`、`katex.min.css`、`highlight-github-dark.min.css`
- `scripts/`：`webview-base.js`（基础脚本）、`markdown-it.min.js`、`markdown-it-katex.min.js`、`katex.min.js`、`highlight.min.js`

---

## 12. Remote 环境处理

```js
const isRemote = typeof vscode.env.remoteName === 'string' && vscode.env.remoteName.length > 0;
```

- **打开本地文件**：远端 + Windows 绝对路径时，转发到 `humanClarification.openLocalFile`（由 UI Helper 扩展提供）；其他情况走 `vscode.workspace.openTextDocument`。
- **`@hc /install`**：远端会调用 `humanClarification.hcInstall.installFromTemplate` 命令，该命令同样由 UI Helper 在远端 UI host 注册。
- **UI Helper**（`justwe9517.human-clarification-ui-helper`）：仅在 remote window 的 UI 侧激活；本地直接跳过。

---

## 13. `package.json` 贡献点速查

| 贡献点 | 数量 | 备注 |
|---|---|---|
| `commands` | 7 | feedback test、delegate(toggle/menu/test)、server(start/stop/toggle) |
| `chatParticipants` | 1 | `human-clarification.hc`，含 `/install` 子命令 |
| `languageModelTools` | **4** | 与 `ToolRegistry` 一一对应 |
| `configuration` | 多组 | `humanClarification.templates.*`、`humanClarification.delegate.*`、`humanClarification.webview.viewColumn`、`humanClarification.server.*` 等 |
| `extensionKind` | `["workspace"]` | 主扩展跑在 workspace 端 |
| `activationEvents` | `["onStartupFinished"]` | 启动后激活 |

---

## 14. 端到端时序：一次澄清

```
用户输入 → LLM 推理 → 选择 request_user_clarification
                   ↓
        VS Code 触发 prepareInvocation
                   ↓
   delegate 已连接？  ── yes ─→ 跳过确认
                   │
                  no
                   ↓
            弹出"授权申请"
                   ↓
         用户确认 → invoke()
                   ↓
       clarificationToolHandler
                   ↓
   shouldDelegate? ─ no → webviewManager.requestClarification(...)
                          ├── createWebviewPanel
                          ├── 注入 CONFIG → loadViewContent
                          └── return Promise   ←─── 挂起

              ┄┄┄ 用户填写并提交 ┄┄┄

       postMessage({ type:'submit', requestId, text, images })
                   ↓
        handleWebviewMessage → handleSubmit
                   ↓
        request.resolve({ text, images, ... })
                   ↓
        buildToolResultFromResponse
                   ↓
        return LanguageModelToolResult
                   ↓
        LLM 拿到 toolResult → 继续推理（同一计费）
                   ↓
        LLM 可再次调用任意工具，循环 §14
```

**结论**：从 LLM 角度看是一次"工具调用"，对话计费不变。

---

## 15. 孤儿 / 未启用模块清单

下列文件存在于源码树，但**未被任何运行时代码引用**（grep 全仓零匹配）：

### 15.1 `out/tools/` 下的孤儿

| 文件 | 说明 |
|---|---|
| `manageTodoListTool.js` + `todoWriter.js` | 提供 `.hc/todos/` 写入能力，但未被 `ToolRegistry` 注册 |
| `writeReportTool.js` + `reportWriter.js` | 提供 `.hc/reports/{Y/M/D}/...md` 写入能力，未注册 |
| `readReportTool.js` | 读取报告内容，未注册 |
| `openTaskManageWebviewTool.js` | 配套 taskManage WebView，但 WebView 模板文件本身也不存在 |
| `testImageApiTool.js` | 内部测试用 |
| `writeReportTestCommand.js` | 调试命令，仅 `feedbackTestCommand` 被 `extension.js` 调用 |

### 15.2 `out/services/` 下的孤儿

| 文件 | 说明 |
|---|---|
| `taskManageService.js` | 列出/读取 `.hc/workflow/` 任务，未被引用 |
| `historyService.js` | 90 天历史记录策略，未被引用 |
| `promptFileService.js` / `toolService.js` / `workspaceFileService.js` | 由 `webviewManager` 在 `getPromptFiles` / `getTools` / `getWorkspaceFiles` 消息分支中调用，**这三个不是孤儿** |

### 15.3 资源孤儿

| 路径 | 说明 |
|---|---|
| `out/resources/views/chat/richInput.old.js` | 旧版富文本输入，运行时加载的是 `richInput/` 子目录 |
| `out/resources/views/chat/richInput.js` 等顶层旧版 | 同上 |

> **结论**：vsix 内仍打包了大量未启用的"半成品"代码。它们曾被 v2.0 文档误描述为已注册的 LM 工具或独立 WebView，但实际不是。

---

## 16. v2.0 → v3.0 修订项（历史归档）

| # | v2.0 错误 | v3.0 修正 |
|---|---|---|
| 1 | "至少 12 个 LM 工具" | 实际 **4 个**；其余文件是 §15 的孤儿 |
| 2 | proposal-helper 列 11 actions（含 `stagingQueries` / `taskQueries`） | 实际 **16 actions**，且名称不同（见 §9.2） |
| 3 | ability-manage actions 为 `listAbilities` / `getAbilityInfo` | 实际只有 `readAbility` |
| 4 | 存在 `taskManage/` / `feedback/` WebView 子目录 | 不存在；`out/resources/views/` 下只有 `chat/` |
| 5 | 存在独立 `feedback.js` / `taskManage.js` 视图脚本 | 不存在 |
| 6 | "deactivate 不完整，未关闭 delegateClient" | `delegateClient` 通过 `context.subscriptions` 自动 dispose；`deactivate()` 只需关 `httpServer` |
| 7 | TaskManage WebView 章节 | 全部删除 |
| 8 | ChipManager / SuggestionManager 等被描述为运行时新组件 | 它们位于 `richInput/`，但 chat/ 顶层旧版同名文件仍在打包，需明确区分 |

---

## 17. 已确认的设计风险（对接 AgentILS 时需注意）

| # | 风险 | 影响 | 建议（仅供 AgentILS 复刻参考） |
|---|---|---|---|
| 1 | `requestClarification` 的 Promise 永不超时 | 用户长时间不操作 → tool invoke 无限挂起 | AgentILS 复刻时加 `timeoutMs` 与心跳 |
| 2 | 临时图片文件在 60s `setTimeout` 内清理；进程崩溃残留 | 磁盘泄漏 | 改用 `fs.promises.unlink` + 启动清理目录 |
| 3 | "授权申请"等中文文案硬编码 | 国际化困难 | 用 `vscode.l10n` |
| 4 | DelegateClient 重连仅一次，无指数退避 | 弱网下抖动 | 实现指数退避 + 最大重试 |
| 5 | `dynamicActionTool` 未知 action 默认走 webview，不报错 | 易拼写错误造成"幻调" | AgentILS 复刻时改为 `throw` |
| 6 | 大量孤儿代码留在 vsix 包内 | 体积、安全审计、误读源码 | 复刻时严格按"已注册"清单实现 |

---

## 18. 文件结构速查（仅列**实际被引用**的部分）

```
extension/out/
  extension.js                 # 激活入口
  webviewManager.js            # WebView 生命周期 + 消息分发

  tools/
    toolRegistry.js            # 注册 4 个 LM tools
    clarificationTool.js       # request_user_clarification
    contactTool.js             # request_contact_user
    feedbackTool.js            # request_user_feedback
    dynamicActionTool.js       # request_dynamic_action（统一入口 + ability 路由）
    toolResultBuilder.js       # 构造 LanguageModelToolResult
    feedbackTestCommand.js     # registerFeedbackTestCommand（开发调试）
    types.js

  delegate/
    delegateClient.js          # WebSocket 委托客户端
    types.js

  server/
    httpServer.js              # OpenAI 兼容 HTTP API

  services/
    promptFileService.js       # @ 触发的 prompt 列表
    toolService.js             # # 触发的工具列表
    workspaceFileService.js    # 工作区文件搜索

  abilities/
    index.js                   # AbilityRegistry + tryHandleWithAbilities
    types.js
    spawn-worker/
      index.js                 # actions: { spawnWorker }
      handlers/{spawnWorker.js, index.js}
      README.js
    ability-manage/
      index.js                 # actions: { readAbility }
      handlers/{readAbility.js, index.js}
      README.js
    proposal-helper/
      index.js                 # actions: 16 个（见 §9.2）
      handlers/{addProposalTask, archiveProposal, completeProposalTask,
                createProposal, deleteProposal, deleteTask, listProposals,
                stagingQueries → 实际为 listStagedTasks/clearStagedTasks 等,
                ...index.js}
      README.js

  webview/
    templateLoader.js          # 加载 configs/*.json
    viewLoader.js              # 注入 HTML
    types.js

  hcInstall/
    templateLoader.js          # @hc /install 模板

  ui/
    localPrompts.js            # registerLocalPrompts

  utils/
    openFile.js

  resources/
    views/chat/                # 唯一存在的视图
      chat.html / chat.js / chat.css / htmlToMarkdown.js
      richInput/{richInput.js, chipManager.js, suggestionManager.js,
                 undoManager.js, pasteHandler.js, attachmentManager.js,
                 richInput.css}
    shared/
      styles/{common.css, katex.min.css, highlight-github-dark.min.css}
      scripts/{webview-base.js, markdown-it.min.js, markdown-it-katex.min.js,
               katex.min.js, highlight.min.js}

  configs/
    clarification-templates.json
    contact-templates.json
    feedback-templates.json

  sample-prompts/              # @hc /install 写入到 ~/Code/User/prompts/
```

孤儿文件清单见 §15。

---

## 附录 A：与 AgentILS 的关键对照（仅作启示，不做复刻方案）

| 维度 | human-clarification | AgentILS（现状） |
|---|---|---|
| 状态机真值源 | 无（每次工具调用独立） | `packages/mcp` 是唯一真值源 |
| 工具注册位置 | extension 内部 `vscode.lm.registerTool` | MCP server 工具 + thin VS Code bridge |
| WebView 主控 | extension 直接 own WebView | extension（agentils-vscode）持有，但状态来自 MCP |
| 多轮交互 | LLM 自主决定何时再调 | MCP 状态机决定 next action |
| Delegate（远端用户） | WebSocket → tenant 网页 UI | 暂无；后续可参考 §7 |
| HTTP API 暴露 LM | 提供 OpenAI 兼容 API | 不在 AgentILS 范围内 |

> AgentILS 复刻方案（4 个 tools 的 native 实现 + WebView 协议合并）将在另一份 `agentils-human-clarification-impl-plan.md` 中给出，本文不展开。
