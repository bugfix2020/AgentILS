# agentils-vscode

> [English](./README.md) | 简体中文

AgentILS 的 VS Code 宿主扩展。注册 4 个 AgentILS LM tool（`agentils_request_user_clarification` / `agentils_request_contact_user` / `agentils_request_user_feedback` / `agentils_request_dynamic_action`），并以 webview 形态承载基于 `apps/webview` 构建的 antdx 面板。

webview 资源从扩展包内的 `webview/` 目录加载（即 `apps/webview/dist` 的拷贝）。构建完 webview 后，运行 workspace task 把产物拷贝到位：

```bash
pnpm run prepare:agentils-extensions
```

（该 task 同时按正确顺序重建 `@agent-ils/mcp`、`@agent-ils/cli` 与扩展本身，并刷新 `apps/vscode-debug/`。）

## 角色边界

- 本包是 **thin bridge**：业务逻辑（park / resolve / sweep / 状态机）属于 `packages/mcp`
- 在扩展进程内 in-process 启 mcp HTTP bridge（随机端口），并通过 `AgentilsClient` 把 4 个 LM tool 调用 park 到 mcp orchestrator
- 详细模块边界见 [`docs/instructions/vscode-ext.instructions.md`](../../../docs/instructions/vscode-ext.instructions.md)
