# @agent-ils/mcp

> [English](./README.md) | 简体中文

**AgentILS** = _Intelligent Logical System_（缩写借自航空领域的 _Instrument Landing System_）。

AgentILS 的 MCP 核心 server。stdio + HTTP 双传输；可选 JSON 文件持久化；基于心跳的长运行 tool 支持。

## 运行

```bash
pnpm --filter @agent-ils/mcp build
pnpm --filter @agent-ils/mcp start          # 同时启 stdio + http
pnpm --filter @agent-ils/mcp start:http     # 仅 http（用于 webview 测试）
```

默认状态文件：`~/.agentils/state.json`（需要在 `ServerOptions.statePath` 显式开启 JsonStore）。
默认 HTTP bridge：`http://127.0.0.1:8788`。
