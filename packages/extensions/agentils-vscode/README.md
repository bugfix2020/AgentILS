# agentils-vscode

> English | [简体中文](./README.zh-CN.md)

VS Code host extension. Registers the four AgentILS LM tools and hosts the
antdx webview built from `apps/webview`.

The webview is loaded from `webview/` (a copy of `apps/webview/dist`).
After building the webview package, run the workspace task that copies
the built assets into place:

```bash
pnpm run prepare:agentils-extensions
```

(The task also rebuilds `@agent-ils/mcp`, `@agent-ils/cli` and the
extension itself in the correct order before refreshing
`apps/vscode-debug/`.)
