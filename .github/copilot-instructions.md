---
applyTo: 'agent-gate/**'
---

# Agent Gate MCP Server 开发规范

## 项目结构

- `src/types/` — 核心类型定义（Plan, User, AgentRun, RunStep, ToolPolicy 等）
- `src/config/` — 默认配置常量
- `src/store/` — 内存存储层（MemoryStore）
- `src/audit/` — 审计日志（AuditLogger）
- `src/budget/` — 预算检查器（BudgetChecker）
- `src/policy/` — 工具策略检查（ToolPolicyChecker）
- `src/gateway/` — 平台网关（Gateway）
- `src/orchestrator/` — 编排器（Orchestrator）
- `src/tools/` — MCP Tool 注册模块
- `src/index.ts` — MCP Server 入口

## MCP Tools 清单

| Tool | 说明 |
|------|------|
| `interactive_feedback` | 向用户收集反馈/确认 |
| `approval_tool` | 高风险操作审批 |
| `gate_status` | 查询用户身份/额度状态 |
| `create_run` | 创建 Run |
| `start_run` | 启动 Run |
| `complete_run` | 完成 Run |
| `cancel_run` | 取消 Run |
| `get_run` | 查询 Run 快照 |
| `query_audit_log` | 查询审计日志 |
| `get_tool_policy` | 查询工具策略 |
| `set_tool_policy` | 设置工具策略 |
| `get_access_policy` | 查询访问策略 |
| `check_budget` | 查询 Run 预算状态 |

<interactive_feedback_rules>
# Interactive Feedback Loop Protocol

You are operating under a strict **Non-Termination Protocol**. You are NOT ALLOWED to summarize, finish, or end the task until the user explicitly terminates the loop via the `mcp_agent-gate_interactive_feedback` tool.

<mandatory_enforcement_policy>
1. **Never End Voluntarily**: Modifying files or fetching data does NOT mean your task is done. The task is ONLY considered done if `mcp_agent-gate_interactive_feedback` returns `[[FEEDBACK_DONE]]`.
2. **Always Chain Tool Calls**: When `mcp_agent-gate_interactive_feedback` returns a user string, you are currently in "mid-task". You MUST NOT write a concluding message in the chat box! You MUST process the user's feedback, and then IMMEDIATELY issue a new `mcp_agent-gate_interactive_feedback` tool call.
3. **No Final Chat Text**: Do not say "Here is your response" in the chat. Put your detailed reply inside the `answer` argument of the tool call, and ask your follow-up in the `question` argument.
</mandatory_enforcement_policy>
</interactive_feedback_rules>

## 编码约定

- 使用 TypeScript strict 模式
- 模块系统：ESM（`"type": "module"`）
- 所有 import 路径使用 `.js` 后缀
- 工具注册函数签名：`register*Tool(mcpServer: McpServer, ...deps): void`
- 使用 Zod 定义工具参数 schema
- 使用 `mcpServer.server.elicitInput()` 进行用户交互
