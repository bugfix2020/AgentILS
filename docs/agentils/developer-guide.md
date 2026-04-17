# AgentILS Developer Guide / 开发者指引

This is the entry point for AgentILS developer documentation. Choose your language below.

本文档是 AgentILS 开发者文档的入口。请选择语言。

---

## MCP Server Debugging / MCP Server 调试

| Language | Document |
|----------|----------|
| 中文 | [MCP Server 调试指引](./debugging-mcp-zh.md) |
| English | [MCP Server Debugging Guide](./debugging-mcp-en.md) |

Covers: building the project, running the MCP Server (stdio / HTTP), debugging with MCP Inspector and VS Code breakpoints, running tests, and architecture reference.

涵盖：项目构建、运行 MCP Server（stdio / HTTP）、使用 MCP Inspector 和 VS Code 断点调试、运行测试、架构速查。

---

## VS Code Extension Debugging / VS Code 扩展调试

| Language | Document |
|----------|----------|
| 中文 | [VS Code 扩展调试指引](./debugging-vscode-ext-zh.md) |
| English | [VS Code Extension Debugging Guide](./debugging-vscode-ext-en.md) |

Covers: building the single `agentils-vscode` extension, using the preconfigured launch configuration, breakpoint debugging, and the MCP + WebView call chain.

涵盖：构建单个 `agentils-vscode` 扩展、使用预配置的 launch 配置、断点调试，以及 MCP + WebView 调用链。

---

## Quick Start / 快速开始

```bash
# 1. Install dependencies / 安装依赖
pnpm install

# 2. Build everything / 构建全部
pnpm build

# 3. Install AgentILS prompts into VS Code / 安装 AgentILS prompts 到 VS Code
pnpm agentils:inject:vscode

# 4. Start the extension locally / 本地启动扩展
#    Press Cmd+Shift+D → Select "AgentILS: VS Code Extension" → F5
```

Then validate in the Extension Development Host:

1. Open Copilot Chat.
2. Type `/agentils.run-code welcome onboarding`.
3. Confirm the tool invocation when VS Code asks to start the AgentILS task console.
4. Expect the AgentILS WebView panel to open.

然后在 Extension Development Host 里验证：

1. 打开 Copilot Chat。
2. 输入 `/agentils.run-code welcome onboarding`。
3. 当 VS Code 询问是否启动 AgentILS task console 时，点击确认。
4. 预期会弹出 AgentILS WebView 面板。

To remove the injected VS Code prompts and MCP config later:

```bash
pnpm agentils:uninstall:vscode
```

如果后面需要清理 VS Code 注入项，可以执行：

```bash
pnpm agentils:uninstall:vscode
```
