# Agent Gate MCP Server

> VS Code AI Agent 编排平台控制层 — 基于 MCP (Model Context Protocol) 的网关服务

Agent Gate 是一个轻量级 MCP Server，为 VS Code Copilot Agent 提供**访问控制**、**预算管理**、**审计日志**和**用户交互**能力。

## 核心能力

| 能力 | 说明 |
|------|------|
| **身份识别** | 支持匿名/已登录用户，邮箱白名单/域名白名单 |
| **配额管控** | 按 Plan 区分月度 Run 额度，匿名 50 次/月，个人 200 次/月 |
| **Run 预算** | 每次 Run 限制 LLM 步数、工具调用次数、Token 上限、墙钟时间 |
| **工具策略** | 按工具名定义风险等级、审批要求、Agent/Prompt 限制 |
| **审计日志** | 全量事件记录（网关决策、Run 生命周期、Step 执行） |
| **用户交互** | 通过 MCP Elicitation 实现结构化反馈收集和操作审批 |

## 快速开始

### 安装依赖

```bash
cd agent-gate
npm install
```

### 编译

```bash
npm run build
```

### 在 VS Code 中使用

在**工作区根目录**的 `.vscode/mcp.json` 中添加配置（注意不是 agent-gate 子目录）：

```json
{
  "mcpServers": {
    "agent-gate": {
      "command": "node",
      "args": ["agent-gate/dist/index.js"]
    }
  }
}
```

保存后 VS Code 会自动发现并启动 MCP Server，在扩展面板的 "MCP 服务器" 列表中可以看到 `agent-gate`。

### 开发模式

```bash
npm run dev
```

使用 `tsx` 直接运行 TypeScript 源码，无需编译。

## 在 Copilot Chat 中使用

MCP Server 启动后，所有注册的 Tools 会自动出现在 Copilot Chat 的工具列表中。你可以在对话中直接调用或让 Agent 自动调用。

### 基本对话示例

**查询当前身份与额度：**

```
我还有多少额度？

→ Copilot 自动调用 gate_status 工具，返回当前用户的 Plan、已用/剩余 Run 次数
```

**创建并执行 Run：**

```
帮我创建一个新的 Run，model 用 claude-opus-4

→ Copilot 调用 create_run，网关自动检查身份、白名单、额度
→ 返回 { type: "ALLOW", run: { id: "run_xxx", status: "created", ... } }
```

**查询 Run 状态和预算：**

```
查看 run_1742688000_1 的当前状态

→ Copilot 调用 get_run，返回 Run 快照（状态、预算、用量、步骤列表）
```

```
检查这个 Run 的预算还剩多少

→ Copilot 调用 check_budget，返回 remaining.llmSteps, toolCalls, tokens 等
```

**高风险操作审批：**

```
删除 /tmp/data 目录

→ Copilot 调用 approval_tool，弹出审批表单：
  ⚠️ 高风险操作审批
  操作：delete directory /tmp/data
  风险说明：不可逆的文件删除操作
  [批准] [拒绝]

→ 用户点击 [批准] 后继续执行，点击 [拒绝] 则终止
```

**反馈与确认：**

```
完成任务前确认一下

→ Copilot 调用 interactive_feedback，弹出反馈表单：
  请确认本次任务是否已完成
  [继续] [修改] [完成]
  你的反馈：____

→ 用户选择 "完成" 并输入反馈 → 对话正常结束
→ 用户选择 "修改" 并输入补充说明 → Copilot 继续处理
```

**审计日志查询：**

```
查看这次 Run 的所有操作记录

→ Copilot 调用 query_audit_log，返回按时间排序的事件列表
```

**工具策略管理：**

```
把 shell_exec 设置为高风险工具，需要审批

→ Copilot 调用 set_tool_policy：
  toolName: "shell_exec"
  riskLevel: "high"
  requiresApproval: true
```

```
查看当前所有工具策略

→ Copilot 调用 get_tool_policy（不传 toolName），返回全部策略列表
```

### Agent Mode 集成

在 Agent Mode 下，Copilot 会**自动决定**何时调用 Agent Gate 的工具：

1. **执行高风险操作前** → 自动触发 `approval_tool`
2. **任务完成时** → 自动触发 `interactive_feedback` 收集确认
3. **需要创建 Run 跟踪时** → 按顺序调用 `create_run` → `start_run` → ... → `complete_run`
4. **需要检查额度/预算时** → 调用 `gate_status` 或 `check_budget`

### 手动调用工具

在 Copilot Chat 中，你也可以明确引用工具名来强制调用：

```
使用 gate_status 检查我的额度
使用 check_budget 检查 run_xxx 的预算
使用 query_audit_log 查看 user_001 的所有事件
```

## 架构

```
src/
├── index.ts              # MCP Server 入口，注册所有 Tools
├── types/                # 核心类型定义
│   ├── user.ts           # 用户
│   ├── plan.ts           # 订阅计划
│   ├── agent-run.ts      # Run（状态、预算、用量）
│   ├── run-step.ts       # Step（LLM/Tool/Elicitation）
│   ├── access-policy.ts  # 访问策略（白名单、封禁列表）
│   ├── tool-policy.ts    # 工具策略（风险等级、审批）
│   ├── gate-result.ts    # 网关决策结果
│   ├── tool-result.ts    # 工具返回结果
│   └── audit-event.ts    # 审计事件
├── config/
│   └── defaults.ts       # 默认配置常量
├── store/
│   └── memory-store.ts   # 内存存储（User/Plan/Run/Step/Policy/Audit）
├── audit/
│   └── audit-logger.ts   # 审计日志记录器
├── budget/
│   └── budget-checker.ts # 预算检查（LLM/Tool/Token/WallClock）
├── policy/
│   └── tool-policy-checker.ts  # 工具策略检查
├── gateway/
│   └── gateway.ts        # 平台网关（身份→白名单→额度→预算→创建Run）
├── orchestrator/
│   └── orchestrator.ts   # Run 编排器（生命周期、Step 管理）
└── tools/                # MCP Tool 注册模块
    ├── interactive-feedback.ts   # 用户反馈收集
    ├── approval-tool.ts          # 高风险操作审批
    ├── gate-status-tool.ts       # 身份/额度状态查询
    ├── run-management-tool.ts    # Run CRUD
    ├── audit-query-tool.ts       # 审计日志查询
    ├── policy-management-tool.ts # 工具策略管理
    └── budget-query-tool.ts      # 预算状态查询
```

## MCP Tools 参考

### 用户交互

#### `interactive_feedback`

向用户收集反馈、确认或补充信息。

| 参数 | 类型 | 说明 |
|------|------|------|
| `title` | string | 反馈标题 |
| `question` | string | 问题或提示内容 |
| `allowDone` | boolean? | 允许"完成"选项（默认 true） |
| `allowRevise` | boolean? | 允许"修改"选项（默认 true） |
| `allowContinue` | boolean? | 允许"继续"选项（默认 true） |

返回用户选择的 `status`（continue/revise/done）和 `msg`（文字反馈）。

#### `approval_tool`

在执行高风险或不可逆操作前请求用户审批。

| 参数 | 类型 | 说明 |
|------|------|------|
| `action` | string | 需审批的操作名称 |
| `riskSummary` | string | 风险概述 |
| `diffSummary` | string? | 变更摘要（可选） |

返回 `approved: true/false` 和可选的 `reason`。

### 状态查询

#### `gate_status`

查询当前用户身份状态、剩余额度、白名单状态。

| 参数 | 类型 | 说明 |
|------|------|------|
| `userId` | string? | 用户 ID（省略则为匿名） |
| `sessionId` | string? | 会话 ID（匿名额度查询） |

#### `check_budget`

查询指定 Run 的预算使用情况。

| 参数 | 类型 | 说明 |
|------|------|------|
| `runId` | string | Run ID |

返回 `budget`、`usage`、`remaining` 和 `withinBudget` 标志。

### Run 管理

#### `create_run`

通过网关创建 Run，自动执行身份校验、白名单、额度检查。

| 参数 | 类型 | 说明 |
|------|------|------|
| `sessionId` | string | 会话 ID |
| `userId` | string? | 用户 ID |
| `entryPrompt` | string | 初始提示词 |
| `selectedModel` | string | 模型标识 |
| `selectedAgent` | string? | Agent 名称 |
| `selectedPromptFile` | string? | Prompt 文件 |
| `workspaceId` | string? | 工作区 ID |

#### `start_run`

启动已创建的 Run（created → running）。

| 参数 | 类型 | 说明 |
|------|------|------|
| `runId` | string | Run ID |

#### `complete_run` / `cancel_run`

完成或取消 Run。

| 参数 | 类型 | 说明 |
|------|------|------|
| `runId` | string | Run ID |

#### `get_run`

获取 Run 快照（状态、预算、用量、步骤列表）。

| 参数 | 类型 | 说明 |
|------|------|------|
| `runId` | string | Run ID |

### 审计与策略

#### `query_audit_log`

按 Run ID 或 User ID 查询审计事件。

| 参数 | 类型 | 说明 |
|------|------|------|
| `runId` | string? | 按 Run 过滤 |
| `userId` | string? | 按用户过滤 |
| `limit` | number? | 最大返回条数（默认 50） |

#### `get_tool_policy`

查询指定工具或全部工具的策略配置。

| 参数 | 类型 | 说明 |
|------|------|------|
| `toolName` | string? | 工具名（省略返回全部） |

#### `set_tool_policy`

创建或更新工具策略。

| 参数 | 类型 | 说明 |
|------|------|------|
| `toolName` | string | 工具名 |
| `riskLevel` | low/medium/high | 风险等级 |
| `requiresApproval` | boolean | 是否需要审批 |
| `requiresVerifiedEmail` | boolean? | 是否需要已验证邮箱 |
| `requiresAllowlistedEmail` | boolean? | 是否需要白名单邮箱 |
| `allowedAgents` | string[]? | 限制 Agent |
| `allowedPromptFiles` | string[]? | 限制 Prompt 文件 |

#### `get_access_policy`

查询访问策略（白名单、封禁工具、高风险工具列表）。

| 参数 | 类型 | 说明 |
|------|------|------|
| `policyId` | string? | 策略 ID（默认 "default"） |

## 网关流程

```
用户请求 → Gateway.process()
  ├── 1. 识别用户身份
  ├── 2. 确定 Plan（anonymous / personal）
  ├── 3. 邮箱白名单检查
  ├── 4. 月度额度检查
  ├── 5. 计算本次 Run 预算上限
  ├── 6. 创建 Run 记录
  └── 7. 放行 → { type: 'ALLOW', run }

拒绝结果类型：
  - REQUIRE_LOGIN — 匿名额度耗尽
  - EMAIL_NOT_ALLOWED — 邮箱不在白名单
  - QUOTA_EXCEEDED — 月度额度用完
  - PLAN_RESTRICTED — Plan 不存在
```

## 默认配置

| 配置项 | 匿名 | 个人 |
|--------|-------|------|
| 月度 Run 数 | 50 | 200 |
| 单次 LLM 步数 | 8 | 8 |
| 单次工具调用 | 5 | 5 |
| 单次用户交互 | 2 | 2 |
| 单次 Token 上限 | 200,000 | 200,000 |
| 单次墙钟时间 | 60s | 60s |

## 技术栈

- **TypeScript** 5.8+（strict 模式，ESM）
- **MCP SDK** ^1.27（`@modelcontextprotocol/sdk`）
- **Zod** 3.24（参数校验）
- **Node.js** 22+

## License

MIT
