# AgentILS VS Code 插件 approval 弹窗实现计划

版本：v1.0  
日期：2026-04-16  
所属：[task-execution-pipeline-plan.md](./task-execution-pipeline-plan.md)（对话 B 执行）  
范围：`extensions/agentils-vscode/` 目录

---

## 0. 执行前必读

1. 阅读 `AGENTS.md` 和 `.hc/codex-modular-debug.md`
2. 阅读 `.hc/copilot/task-pipeline-refactor.md`（完整对话记录和决策）
3. 阅读 `docs/agentils/task-execution-pipeline-plan.md`（总体改造计划）
4. **必读** `docs/agentils/vsix-human-clarification-complete-chain.md`（参考插件架构）
5. **必读** `docs/agentils/agentils-vscode-complete-chain.md`（插件调用链路）

---

## 1. 改造目标

将 WebView 中的 approval 交互从 inline form 改造为 **modal.confirm** 风格弹窗，根据控制法则（normal/alternate/direct）展示不同内容。

当前已有基础：
- `task-console-panel.ts`：WebView 面板主类，已有 `handleMessage()` 处理消息
- `task-console-protocol.ts`：已有 `PanelApprovalInteractionInfo`（`kind: 'approval'`、`requestId`、`summary`、`riskLevel`、`targets`）
- `task-console-renderer.ts`：已有 approval inline form 渲染（通过 `renderPendingInteraction()`）
- `mcp-elicitation-bridge.ts`：MCP Server → WebView 的反向 elicitation 桥梁

需要改造：inline form → modal overlay，新增 risks 字段，区分 normal/alternate 模式。

---

## 2. API 合同（与对话 A 共享）

对话 B 消费的类型合同（在对话 A Phase 1 中定义）：

```typescript
// src/types/task.ts — RunRecord 新增字段
approvalPassed?: boolean

// extensions/agentils-vscode/src/panel/task-console-protocol.ts — 扩展
interface PanelApprovalInteractionInfo {
  kind: 'approval'
  requestId: string
  summary: string
  riskLevel: 'low' | 'medium' | 'high'
  targets: string[]
  risks?: string[]        // 新增：alternate 模式下的风险列表
  controlMode?: string    // 新增：当前控制法则
}
```

即使对话 A 尚未完成 Phase 1，对话 B 可以基于上述合同独立开发。

---

## 3. Phase 7a — 协议层扩展

### 3.1 变更内容

文件：`extensions/agentils-vscode/src/panel/task-console-protocol.ts`

`PanelApprovalInteractionInfo` 新增字段：
- `risks?: string[]` — alternate 模式下的风险列表
- `controlMode?: 'normal' | 'alternate' | 'direct'` — 当前控制法则

`TaskConsoleMessage` 新增 action 类型：
- `{ action: 'submitApprovalConfirm'; requestId: string }` — 确认执行
- `{ action: 'submitApprovalDecline'; requestId: string; reason?: string }` — 返回修改

---

## 4. Phase 7b — Modal 弹窗渲染

### 4.1 变更内容

文件：`extensions/agentils-vscode/src/panel/task-console-renderer.ts`

将 `renderPendingInteraction()` 中 approval 分支的渲染逻辑改为 modal overlay：

**Normal 模式 modal 内容：**
```html
<div class="modal-overlay">
  <div class="modal-card">
    <h2>执行审批</h2>
    <p class="modal-summary">{summary}</p>
    <section class="modal-detail">
      <h3>影响范围</h3>
      <ul>{targets}</ul>
    </section>
    <div class="modal-actions">
      <button class="btn-primary" data-action="submitApprovalConfirm">确认执行</button>
      <button class="btn-secondary" data-action="submitApprovalDecline">返回修改</button>
    </div>
  </div>
</div>
```

**Alternate 模式 modal 内容（多出风险区）：**
```html
<div class="modal-overlay">
  <div class="modal-card modal-alternate">
    <h2>执行审批</h2>
    <p class="modal-summary">{summary}</p>
    <section class="modal-detail">
      <h3>影响范围</h3>
      <ul>{targets}</ul>
    </section>
    <section class="modal-risks">
      <h3>⚠️ 当前处于备用法则（alternate），以下风险未完全验证：</h3>
      <ul>{risks}</ul>
      <p class="modal-hint">建议：执行后务必进行人工验证</p>
    </section>
    <div class="modal-actions">
      <button class="btn-warning" data-action="submitApprovalConfirm">我已知晓风险，确认执行</button>
      <button class="btn-secondary" data-action="submitApprovalDecline">返回修改</button>
    </div>
  </div>
</div>
```

### 4.2 CSS 新增

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-card {
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 12px;
  padding: 24px;
  max-width: 560px;
  width: 90%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}
.modal-alternate {
  border-left: 4px solid var(--vscode-editorWarning-foreground);
}
.modal-risks {
  background: rgba(255, 200, 0, 0.08);
  border: 1px solid rgba(255, 200, 0, 0.3);
  border-radius: 8px;
  padding: 12px 16px;
  margin: 12px 0;
}
.btn-warning {
  background: var(--vscode-editorWarning-foreground);
  color: #fff;
}
```

---

## 5. Phase 7c — 消息处理

### 5.1 变更内容

文件：`extensions/agentils-vscode/src/task-console-panel.ts`

在 `handleMessage()` 中处理新的 modal 消息：

```typescript
case 'submitApprovalConfirm':
  // 通过 sessionManager 发送 approval accept
  // 等同于当前的 submitPendingInteraction with responseAction='accept'
  break

case 'submitApprovalDecline':
  // 通过 sessionManager 发送 approval decline
  // 等同于 submitPendingInteraction with responseAction='decline'
  break
```

---

## 6. Phase 7d — 降级链路

降级在以下层面自动发生，不需要额外代码：

| 层级 | 触发条件 | 行为 |
|---|---|---|
| Layer 1：WebView modal | VS Code + 插件已安装 | 本次实现的 modal.confirm |
| Layer 2：MCP elicitation | 无 WebView（Cursor/Claude Code） | 已有：`src/gateway/tools.ts` 的 `approval_request` 工具自动走 elicitation |
| Layer 3：纯文本 | 无 elicitation（JetBrains/Zed） | 已有：Agent 在聊天中以文本形式展示方案并等待用户回复 |

本次不需要为 Layer 2/3 写额外代码，它们已经在 MCP 核心层实现。

---

## 7. 执行顺序

```
Phase 7a（协议层）→ Phase 7b（modal 渲染）→ Phase 7c（消息处理）→ Phase 7d（降级验证）
```

### 验证方式

1. 在 VS Code 中打开插件，触发 approval 场景
2. 确认 normal 模式下弹出标准 modal
3. 确认 alternate 模式下弹出带风险区的 modal
4. 确认点击"确认执行"后 approval 正确通过
5. 确认点击"返回修改"后 step 正确回退
