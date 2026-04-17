# AgentILS VS Code 扩展调试指引

本文档说明当前 AgentILS VS Code 扩展面的构建和调试流程。

当前范围：
- `extensions/agentils-vscode` — 主扩展，提供 Task Console、LM Tools、MCP runtime 接入和 MCP elicitation bridge

已移除范围：
- `agentils-ui-helper` 已不再存在于本仓库中，也不属于当前调试流程

---

## 1. 前置要求

| 依赖 | 最低版本 |
|------|---------|
| VS Code | 1.90.0+ |
| Node.js | 20+ |
| pnpm | 10+ |

安装依赖：

```bash
pnpm install
```

---

## 2. 构建

推荐方式：

```bash
pnpm build
```

如果只想构建 VS Code 扩展：

```bash
pnpm --filter agentils-vscode build
```

常用检查：

```bash
pnpm --filter agentils-vscode typecheck
pnpm --filter @agentils/mcp test
```

---

## 3. 面向用户的完整跑通流程

推荐按用户真实操作顺序来验证：

1. 安装依赖并构建仓库。
2. 运行 CLI 安装器，把 AgentILS prompts 和 MCP 配置注入到 VS Code。
3. 通过 `F5` 本地启动 VS Code 扩展。
4. 在 Copilot Chat 里执行 `/agentils.run-code`。
5. 确认 tool 调用，并预期弹出 AgentILS WebView。

先在仓库根目录按顺序执行这三个命令：

```bash
pnpm install
pnpm build
pnpm agentils:inject:vscode
```

每一步的作用：

1. `pnpm install` 安装 workspace 依赖。
2. `pnpm build` 构建 MCP runtime 和 VS Code 扩展。
3. `agentils inject vscode` 把 AgentILS prompts 和 MCP 配置注入到 VS Code。

在启动扩展之前，先确认这两个文件存在：

1. `packages/mcp/dist/index.js`
2. `~/Library/Application Support/Code/User/prompts/agentils.run-code.prompt.md`

如果后面想清理 VS Code 注入项，可以执行：

```bash
pnpm agentils:uninstall:vscode
```

---

## 4. 本地启动扩展

工作区现在只保留一个 launch 配置：

- `AgentILS: VS Code Extension`

使用方式：

1. 打开 **Run and Debug** 面板
2. 选择 **AgentILS: VS Code Extension**
3. 按 `F5`

这会：
- 先执行 `prepare:agentils-extensions`
- 构建 workspace 包
- 构建 `extensions/agentils-vscode`
- 启动只加载 `agentils-vscode` 的 Extension Development Host
- 自动打开独立的调试工作区 `apps/vscode-debug`

---

## 5. 用户在 Copilot Chat 里要做什么

进入 Extension Development Host 之后：

1. 打开 Copilot Chat。
2. 精确输入：

```text
/agentils.run-code welcome onboarding
```

3. 当 VS Code 弹出 AgentILS tool 确认框时，点击 `Continue`。
4. 预期会打开 `AgentILS Task Console` WebView 面板。

你也可以试这两个入口：

- `/agentils.run-task welcome onboarding`
- `#startnewtask`

当前 VS Code 主流程优先使用 `/agentils.run-code`。

---

## 6. 预期结果

如果 setup 正确，用户可见的顺序应该是：

1. Copilot 里能看到 `/agentils.run-code` 这个入口。
2. VS Code 弹出 `agentils_start_conversation` 的确认框。
3. 点击确认后，打开 `AgentILS Task Console` WebView。
4. 后续澄清、反馈、审批继续在 AgentILS 面板里完成。

---

## 7. 运行链路预期

当前 VS Code 主链路是：

`Copilot prompt 或 AgentILS custom prompt -> agentils-vscode LM tool -> MCP runtime -> AgentILS WebView -> MCP runtime -> Copilot`

关键文件：

- `extensions/agentils-vscode/src/extension.ts`
- `extensions/agentils-vscode/src/lm-tools/index.ts`
- `extensions/agentils-vscode/src/session/conversation-session-manager.ts`
- `extensions/agentils-vscode/src/task-console-panel.ts`
- `extensions/agentils-vscode/src/mcp-elicitation-bridge.ts`
- `packages/mcp/src/gateway/tools.ts`

---

## 8. 建议断点位置

建议在这些文件打断点：

- `extensions/agentils-vscode/src/extension.ts` 看激活流程
- `extensions/agentils-vscode/src/lm-tools/index.ts` 看 LM tool 调用
- `extensions/agentils-vscode/src/session/conversation-session-manager.ts` 看面板拉起
- `extensions/agentils-vscode/src/task-console-panel.ts` 看 WebView 消息处理
- `packages/mcp/src/gateway/tools.ts` 看 MCP tool 入口

---

## 9. 常见排查

如果 Copilot 里能看到 `/agentils.run-code`，但没有弹 WebView：

1. 确认 Extension Development Host 里真的加载了 `agentils-vscode`
2. 确认 `packages/mcp/dist/index.js` 已存在
3. 确认 prompts 已安装到 `~/Library/Application Support/Code/User/prompts`
4. 安装 prompts 后 reload 当前 VS Code 窗口
5. 检查 `agentils_start_conversation` 的确认框是否被取消掉了

如果扩展激活了，但 MCP 调用失败：

1. 重新执行 `pnpm build`
2. 如果手动配过 `agentils.runtime.serverModulePath`，检查它是否仍然正确
3. 查看 Output channel 和 Developer Tools console
4. 如果想彻底重置 VS Code 侧注入，可以先执行 `pnpm agentils:uninstall:vscode`，再重新执行 `pnpm agentils:inject:vscode`

---

## 10. 历史说明

`docs/agentils/` 下仍有部分参考文档会讨论 helper 型 UI 扩展，那些内容是在分析外部参考实现，不代表当前 AgentILS 仓库还保留第二个 VS Code 扩展。
