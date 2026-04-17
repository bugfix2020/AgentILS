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

Covers: building extensions (`agentils-vscode` + `agentils-ui-helper`), using preconfigured launch configurations, breakpoint debugging, combined MCP + extension debugging, and extension architecture details.

涵盖：构建扩展（`agentils-vscode` + `agentils-ui-helper`）、使用预配置的 launch 配置、断点调试、MCP + 扩展联合调试、扩展架构详情。

---

## Quick Start / 快速开始

```bash
# 1. Install dependencies / 安装依赖
npm install
cd extensions/agentils-vscode && npm install && cd ../..

# 2. Build everything / 构建全部
npm run build
cd extensions/agentils-vscode && npm run build && cd ../..

# 3. Smoke test / 冒烟测试
npm run smoke

# 4. Run tests / 运行测试
npm run test:unit

# 5. Debug in VS Code / 在 VS Code 中调试
#    Press Cmd+Shift+D → Select "AgentILS: Both Extensions" → F5
```
