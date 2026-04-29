# agentils-vscode

VS Code host extension. Registers the four AgentILS LM tools and hosts the
antdx webview built from `apps/webview`.

The webview is loaded from `webview/` (a copy of `apps/webview/dist`).
After building the webview package, run:

```bash
cp -r ../../../apps/webview/dist webview
```

(or use the workspace `prepare:agentils-extensions` task.)
