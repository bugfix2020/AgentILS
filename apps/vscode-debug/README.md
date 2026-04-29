# AgentILS VS Code Debug Workspace

This directory exists so the Extension Development Host can open a separate workspace from the main AgentILS repository window.

Use this workspace to verify the current VS Code flow:

1. Run `pnpm agentils:install:vscode` from the repository root.
2. Press `F5` with the `AgentILS: VS Code Extension` launch configuration.
3. In the Extension Development Host, open Copilot Chat.
4. Run `/runTask welcome onboarding`.

Expected result:

- VS Code first calls `stateGet`, then immediately calls `runTaskLoop`.
- The persistent `AgentILS` WebView opens and shows the current loop state.
