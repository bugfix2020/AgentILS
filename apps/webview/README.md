# apps/webview

AgentILS webview (React + antd + @ant-design/x). Built with Vite.

```bash
pnpm --filter agentils-vscode-webview build
```

The build copies `dist/` into `packages/extensions/agentils-vscode/webview/`
so the VS Code extension can serve it via `webview.asWebviewUri`.
