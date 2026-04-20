# AgentILS 日志诊断指南

## 快速开始

### 启用日志记录

所有日志系统都通过 `AGENTILS_DEBUG=true` 环境变量控制。

**在终端执行：**
```bash
export AGENTILS_DEBUG=true
# 然后启动 VS Code Extension 的开发环境
code /Users/liuyuxuan/Desktop/Lenovo/agent-gate
```

或在 .env 文件中设置：
```bash
AGENTILS_DEBUG=true
```

### 执行测试流程

1. **启动 VS Code** 并打开 AgentILS 扩展
2. **打开 Copilot Chat** 并输入：`@agentils`
3. **按照 webview 的引导进行操作**：
   - 如果立即弹出 pending interaction（应该等待用户输入再弹出），这就是 Bug A
   - 记录此时的消息和 UI 状态

4. **查看日志文件**：
```bash
ls -lh ~/.agentils/logs/
cat ~/.agentils/logs/webview-*.jsonl | jq .
cat ~/.agentils/logs/extension-*.jsonl | jq .
cat ~/.agentils/logs/mcp-*.jsonl | jq .
```

---

## 日志结构

### 日志文件位置
```
~/.agentils/logs/
├── webview-2026-04-20.jsonl      # Webview 层日志
├── extension-2026-04-20.jsonl     # Extension 层日志
└── mcp-2026-04-20.jsonl           # MCP 服务层日志
```

### 日志行格式（JSONL）
每一行都是独立的 JSON 对象：
```json
{
  "timestamp": "2026-04-20T10:30:45.123Z",
  "level": "info|debug|warn|error",
  "source": "webview|extension|mcp",
  "module": "App|GuidedPromptBubble|extension.ts|approval_request|...",
  "event": "bootstrap_message_valid|pending_interaction_shown|user_message_submitted|...",
  "...": "任意其他字段"
}
```

---

## 关键诊断事件

### Webview 层关键事件

| 事件 | 模块 | 含义 |
|-----|-----|------|
| `bootstrap_message_valid` | App | Bootstrap 消息已收到并解析 |
| `pending_interaction_shown` | App | Pending interaction 弹出，包含消息数量 |
| `user_message_submitted` | App | 用户提交消息（包含内容预览） |
| `message_send_blocked` | App | 消息发送被阻止（原因：empty_input 或 session_not_active） |
| `interaction_submitted` | GuidedPromptBubble | 用户提交了引导问题的答案 |

### Extension 层关键事件

| 事件 | 模块 | 含义 |
|-----|-----|------|
| `logEntry` | task-console-panel | 收到来自 webview 的日志条目 |
| （文件写入）| jsonl-logger | 日志已追加到 jsonl 文件 |

### MCP 层关键事件

| 事件 | 工具名 | 含义 |
|-----|-------|------|
| `tool_called` | new_task_request | 任务启动请求 |
| `run_started` | new_task_request | 任务已创建 |
| `session_created` | resolveOrCreateSession | 新的会话已创建 |
| `interaction_opened` | approval_request/feedback_gate/clarification_request | 交互问题弹出 |

---

## 问题排查步骤

### Bug A：Pending Interaction 立即弹出

**预期行为**：
- 用户执行 @agentils
- Webview 显示欢迎屏幕（WelcomeScreen）
- 等待用户输入或选择操作

**异常行为**：
- Webview 立即显示 "当前有待处理的引导问题 Start AgentILS Task"
- 没有给用户机会进行初始操作

**诊断步骤**：
1. 在日志中查找 `pending_interaction_shown`
2. 检查 `messageCount` 是否为 0（表示没有用户输入）
3. 如果是 0，查找 MCP 层的 `interaction_opened` 事件时间戳
4. 比较时间：pending interaction 何时出现、session 何时创建

**可能的根因**：
- MCP 在 session 创建时自动生成了 pending interaction
- Session 初始化逻辑有问题
- Bootstrap 消息中已包含 pendingInteraction 字段

---

### Bug B：User Input 未被发送

**预期行为**：
- 用户在输入框输入 "hello"
- 点击发送
- `user_message_submitted` 事件出现在日志中
- `postMessage({ action: 'submitSessionMessage', content: 'hello' })` 被调用

**异常行为**：
- 用户输入 + 点击发送
- 日志中不出现 `user_message_submitted` 事件
- LLM 收不到用户消息

**诊断步骤**：
1. 在日志中搜索 `user_message_submitted`
2. 如果没有找到，查找 `message_send_blocked`，看是否因 `empty_input` 或 `session_not_active` 被阻止
3. 检查 Session 状态：`session.status === 'active'`？
4. 检查输入框值是否正确传递给 `handleSend()`

---

### Bug C：GuidedPromptBubble 使用错误的组件

**预期行为**：
- 使用 Ant Design X 的 `Suggestion` 组件
- 显示系统指令（只读）
- 提供选项供用户点击选择

**当前行为**：
- 使用 Card 组件
- 看起来像可编辑的表单
- 误导用户认为可以自由编辑

**修复步骤**：
- 查看 `/extensions/agentils-vscode/webview/src/components/GuidedPromptBubble.tsx`
- 替换 Card 组件为 Ant Design X Suggestion 组件
- 参考：https://x.ant.design/components/suggestion-cn

---

## 实用查询命令

### 查看最新日志
```bash
# 查看今天的所有 webview 日志
tail -f ~/.agentils/logs/webview-$(date +%Y-%m-%d).jsonl

# 格式化输出（使用 jq）
cat ~/.agentils/logs/webview-$(date +%Y-%m-%d).jsonl | jq .
```

### 按事件过滤
```bash
# 查找所有 "pending_interaction_shown" 事件
cat ~/.agentils/logs/*.jsonl | jq 'select(.event == "pending_interaction_shown")'

# 查找所有错误
cat ~/.agentils/logs/*.jsonl | jq 'select(.level == "error")'

# 按模块过滤（如 "App" 模块）
cat ~/.agentils/logs/*.jsonl | jq 'select(.module == "App")'
```

### 按时间范围查询
```bash
# 查看从 10:30 开始的日志
cat ~/.agentils/logs/*.jsonl | jq 'select(.timestamp > "2026-04-20T10:30:00Z")'
```

### 查看消息流时序
```bash
# 以时间序列显示，包含模块、事件、内容
cat ~/.agentils/logs/*.jsonl | jq '[.timestamp, .module, .event, .source] | @csv'
```

---

## 日志禁用与发布

### 禁用日志（发布前）

1. **环境变量**：确保不设置 `AGENTILS_DEBUG=true`
2. **代码检查**：`JsonlLogger` 调用在 `if (!this.isEnabled)` 时会直接返回，零开销
3. **验证**：
   ```bash
   unset AGENTILS_DEBUG
   # 运行测试，验证没有日志文件被生成
   ls -l ~/.agentils/logs/ # 应该为空或不存在
   ```

### 安全性

- 日志写入 `~/.agentils/logs/` 仅包含诊断信息
- 不记录用户的源代码或敏感凭证
- 只记录 event 和 module 名称以及必要的参数

---

## 下一步

1. **执行测试流程**（上面"快速开始"）
2. **收集日志文件**
3. **分析日志**，判断问题根源
4. **修复 Bug**
5. **禁用日志**（设置 `AGENTILS_DEBUG=false` 或不设置）

