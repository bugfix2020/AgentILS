# apps/webview

> [English](./README.md) | 简体中文

AgentILS webview（React + antd + @ant-design/x），由 Vite 构建。

```bash
pnpm --filter agentils-vscode-webview build
```

构建会把 `dist/` 拷到 `packages/extensions/agentils-vscode/webview/`，由 VS Code 扩展通过 `webview.asWebviewUri` 加载。

## 角色边界

- webview 是产品体验真值源；mcp / 扩展 host / cli 模板按 webview 的渲染需求倒推
- 但**业务状态**真值源仍是 `packages/mcp` 的 `InteractionStore`，webview 只是它的 SSE 投影
- 详细约束见 [`docs/instructions/webview-source-of-truth.instructions.md`](../../docs/instructions/webview-source-of-truth.instructions.md)
