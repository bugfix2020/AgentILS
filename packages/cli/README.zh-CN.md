# @agent-ils/cli

> [English](./README.md) | 简体中文

**AgentILS** = _Intelligent Logical System_（缩写借自航空领域的 _Instrument Landing System_）。

旧版 VS Code 扩展安装器的零依赖替代方案。

```bash
npx @agent-ils/cli init --vscode --workspace ./my-project
```

向目标工作区写入：

- `.vscode/mcp.json` — 通过 stdio 注册 `agentils` MCP server
- `.github/prompts/agentils.prompt.md` 等若干 prompt / agent 模板（行为约束）
