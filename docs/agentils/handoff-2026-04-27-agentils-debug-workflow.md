# AgentILS Debug Workflow Handoff - 2026-04-27

本文记录本轮两个提交的范围、取舍和后续注意点。

## 提交 1: `7604131 fix(agentils): stabilize mcp debug workflow`

这个提交把 AgentILS 的主链路从“能分散跑起来”整理成一条可以调试、可观测、可注入模板的链路。

主要内容：

- MCP 层补齐长等待场景：heartbeat timeout 默认拉长到 1 小时，并把 cancel、timeout、LLM 文本结果归一化到统一 response helper。
- 新增 `@agentils/logger`，让 CLI、MCP、VS Code extension 都能写结构化日志，并让 MCP 默认启动 HTTP JSONL log server。
- CLI 模板改成 AgentILS 命名空间，新增 `agentils.run-code.prompt.md`，清掉旧 `hcd.*`、`humanClarificationDebugger.*`、`search_subagent`、`subagentType` 等不应继续安装的引用。
- VS Code extension 改成 AgentILS 自己的 tool id/reference name，补 tool result 适配、日志接入、webview manager 协议和 host heartbeat。
- Webview 从直连 MCP URL 改为 extension-mediated protocol，提交了对应 source 和 built webview assets，保证 extension/webview runtime 不断链。
- F5/手动调试路径改为先跑 `prepare:agentils-extensions`，并新增 `scripts/prepare-debug-workspace.cjs` 生成 `apps/vscode-debug` 的运行态 workspace。
- `apps/vscode-debug/.gitignore` 开始忽略本机生成的 `.vscode/mcp.json` 和 `WELCOME.md`，但保留 `.github` 可见性，便于 Copilot 发现 prompts/agents。
- 补 pre-commit 需要的 instruction sync 产物、flowchart 生成依赖和 Windows Chrome/Edge 发现逻辑。
- ESLint 配置忽略 extension webview bundle，并给 CJS 脚本配置 Node globals/require override。

提交时明确排除或删除的内容：

- `packages/extensions/human-clarification-debugger/**`：只是参考插件/构建产物，不属于 AgentILS 源码。
- `human-clarification-debugger-1.3.8.vsix`：本地参考包，不提交。
- 旧 `.github/prompts/agentils-hc-*.prompt.md`：引用已删除的 HCD 参考目录，不能作为长期仓库入口。
- `apps/vscode-debug/.github/**`、`apps/vscode-debug/.vscode/settings.json`、`apps/vscode-debug/.vscode/mcp.json`：运行态生成文件，由 prepare 脚本重建。

验证情况：

- pre-commit gate 通过：`SYNC COPILOT INSTRUCTIONS`、`GENERATE FLOWCHARTS`、`LINT-STAGED`。
- 手动确认过 task 入口 `open:agentils-extension-host` 可打开调试 Extension Host。
- 注意：本提交保留的是 webview 协议/运行链路一致性，视觉设计仍不是最终形态。

## 提交 2: `1350166 test(agentils): add e2e userflow coverage`

这个提交把剩余有价值的验证资产补进仓库，并删除本机生成的 debug MCP 配置。

主要内容：

- 新增 `apps/e2e-userflow`，覆盖真实用户路径：CLI init、MCP HTTP bridge、stdio MCP、LM tool call、cancel/timeout、VS Code Extension Host 调试路径。
- 新增 `packages/mcp/test/e2e/agentils-vsix-parity.test.ts`，用代码验证 AgentILS 当前 monorepo 行为与参考 VSIX 的核心交互合同一致。
- 新增 `docs/USER-WALKTHROUGH.md`，记录本地未发布版从 F5 到 Copilot Chat 工具调用的手动走查方式。
- 删除 tracked 的 `apps/vscode-debug/.vscode/mcp.json`。这个文件包含本机绝对路径，现在由 `scripts/prepare-debug-workspace.cjs` 在 F5/任务准备阶段生成。
- ESLint 增加 e2e/VS Code 测试文件 override，识别 Node、Mocha、VS Code 测试套件常用 globals。

验证情况：

- pre-commit gate 通过：`SYNC COPILOT INSTRUCTIONS`、`GENERATE FLOWCHARTS`、`LINT-STAGED`。
- 提交后 `git status --short --untracked-files=all` 无输出。

## 后续建议

- 下一轮不要把视觉重写和主链路稳定性混在同一个提交里。当前 webview 已经承担 protocol/runtime 兼容，视觉可以单独开一个小提交重做。
- `apps/vscode-debug` 下的 `.github`、`.vscode/mcp.json`、`WELCOME.md`、settings 都应视为运行态生成物。需要它们时运行 `scripts/prepare-debug-workspace.cjs` 或 VS Code task，不要手写提交。
- 若 `pnpm-lock.yaml` 变化，先确认没有被未跟踪 workspace 污染，尤其不要让参考插件目录重新进入 workspace importer。
