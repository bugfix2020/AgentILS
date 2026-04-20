# @agentils/mcp - Agent Control Plane

MCP Server 实现，包含 AgentILS 的完整状态机、业务逻辑和控制流程。

## 职责

这是 AgentILS 的**唯一业务逻辑和状态真值源**，完全独立于 IDE。核心职责：

- **状态机管理**：任务生命周期管理（task create → approve → execute → verify → done）
- **控制流规则**：预算检查、工具策略评估、审计日志、手工审批
- **人机交互**：通过 `elicitUser()` 与 Extension webview 进行双向交互
- **MCP 服务**：提供 stdio/HTTP 两种传输的 MCP Server

## 架构层次

```
Gateway Layer (tools, prompts, resources)
    ↓
Orchestrator Layer (四个业务 orchestrator)
    ↓
Store Layer (运行态 + 持久化)
```

### 关键模块

| 模块 | 职责 |
|------|------|
| `gateway/` | MCP Server 入口，注册 tools、prompts、resources |
| `orchestrator/` | 业务逻辑聚合（conversation/task/control-mode/verification） |
| `store/` | 状态存储（memory-store + 各专用 store） |
| `types/` | 类型契约（task、session、run、handoff 等） |
| `audit/` | 审计日志系统 |
| `budget/`、`policy/` | 预算检查、工具策略评估 |

## 与 Extension 通信契约

### 出站接口（MCP Tools）

Extension 调用注册的 tools：

- `new_task_request` - 新建任务
- `ui_task_start_gate` - 确认任务详情（可能触发 webview 交互）
- `approval_request` - 申请人工审批
- `feedback_gate` - 申请用户反馈
- `run_verify` - 验证运行结果
- ...等 MCP tools

### 入站接口（Elicitation）

MCP tools 通过 `ctx.elicitUser()` 发起对 Extension webview 的调用：

```typescript
const result = await ctx.elicitUser({
  title: '需要人工确认',
  description: '请审查任务参数',
  kind: 'startTask',
  // ...
})
```

Extension 的 `AgentILSMcpElicitationBridge` 负责将此请求转发到 webview 并收集用户响应。

### 状态投影

MCP 通过 resources 投影状态供 Extension 读取：

- `task-summary://{taskId}` - 任务汇总文档
- `run-log://{runId}` - 运行日志
- `run-snapshot://{runId}` - 运行快照

## 启动方式

### 直接 Node 启动（开发）

```bash
node packages/mcp/dist/index.js
```

自动进入 stdio 服务器模式，等待 MCP Client 连接。

### 通过 VS Code Extension 启动

Extension 在激活时：

1. 通过 `resolveMcpServerPath()` 定位 MCP 产物
2. 调用 `AgentILSMcpElicitationBridge.connect(serverPath)`
3. Bridge 启动 MCP 进程，建立双向通信

## 关键流程

### 任务启动流程

```
chat-participant.ts (@agentils 命令)
    ↓
sessionManager.startTaskGate()
    ↓
task-service-client (HTTP 请求)
    ↓
MCP gateway: ui_task_start_gate tool
    ↓
orchestrator.startUiTask()
    ↓
store.createRun()
```

### 人机交互流程（Session-Driven）

```
MCP tool 检测需要用户输入
    ↓
ctx.elicitUser() 发起 pending interaction
    ↓
ElicitationBridge.handleElicitation() → Extension
    ↓
Extension webview 更新 session 投影，显示待处理交互 UI
    ↓
用户填充或选择 → webview.postMessage('submitPendingInteraction')
    ↓
Extension → ElicitationBridge → MCP
    ↓
MCP 更新 session 状态，runner 恢复
    ↓
tool 获得用户回复，完成执行或发起下一轮交互
```

### 自由会话消息流程（Session-Driven）

```
webview 显示任务历史和输入框
    ↓
用户输入自由消息 → webview.postMessage('submitSessionMessage')
    ↓
Extension → MCP（追加到 session transcript）
    ↓
MCP runner 读取新 user message 并调用 request.model.sendRequest()
    ↓
assistant response chunk 流回 webview（投影到 session）
    ↓
LLM 可能调用 tools（返回 pending interaction）或继续推理
    ↓
继续循环直至任务完成或用户关闭
```

## 数据模型

### 核心实体

- **Run**：单次任务执行记录
- **TaskCard**：结构化任务定义和状态
- **HandoffPacket**：任务移交时的状态快照
- **Session**：用户会话，承载待处理交互状态
- **AuditLog**：所有操作审计记录

详见 `src/types/task.ts`、`src/types/session.ts`

## 开发指南

### 添加新的 Tool

在 `src/gateway/tools.ts` 中：

```typescript
server.registerTool('my_tool', { inputSchema: mySchema }, async (input) => {
  const ctx = createToolRequestContext(runtime)
  // 使用 ctx.elicitUser() 进行交互
  // 使用 runtime.orchestrator 调用业务逻辑
  // 返回结果
})
```

### 添加新的 Orchestrator 业务

在 `src/orchestrator/` 下创建专用 orchestrator，在 `src/orchestrator/orchestrator.ts` 中聚合。

### 测试

```bash
pnpm -C packages/mcp test
```

## 与其他项目的关系

```
packages/mcp (状态机 + 业务逻辑)
    ↑ ↓ MCP tools/elicitation
extensions/agentils-vscode (VS Code 交互层)
    
packages/cli (配置分发工具，依赖 mcp 的类型定义)
```

详见根目录 README 和 [Developer Guide](../../docs/agentils/developer-guide.md)
