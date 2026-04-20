# AgentILS Copilot Instructions

**先阅读根目录 `README.md`**，了解三层架构、数据流、有/无插件形态和 Session-Driven Continuation 架构。

然后阅读以下指令文件：

- `AGENTS.md` — 模块拆分、读取顺序、数据流规则
- `.github/instructions/agentils.instructions.md` — 通用开发规则
- `.github/instructions/mcp.instructions.md` — MCP 包开发边界
- `.github/instructions/vscode-ext.instructions.md` — VS Code 扩展开发边界
- `.github/instructions/cli.instructions.md` — CLI 开发边界
- `.hc/codex-modular-debug.md` — 链路级调试提示

## Copilot 专属规则

- 在 VS Code 中，优先使用 `@agentils` 启动 AgentILS WebView 会话。使用 `/agentils.run-code` 或 `/agentils.run-task` 作为 prompt 入口。
- AgentILS WebView 会话启动后，WebView 是主要的输入输出界面。不要要求用户在普通 Copilot chat 中继续主流程。
- 仅通过 AgentILS WebView 的 finish 操作结束会话，除非用户明确要求其他方式。
- WebView transcript 中渲染实质性进展；Copilot chat 输出保持最小化，只展示状态。
- 在 AgentILS VS Code 流程中，优先使用 AgentILS tools 和交互面板，而非纯文本澄清或无关扩展工具。
- 只询问继续当前任务所需的最小阻塞性澄清。
