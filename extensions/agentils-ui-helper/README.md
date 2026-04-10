# AgentILS UI Helper

This package is the UI-side companion for AgentILS remote windows.

It intentionally keeps business state out of the extension host and only provides:

- local prompt enumeration
- local file read/open bridges
- prompt template installation

## Commands

- `AgentILS: Get Local Prompts`
- `AgentILS: Read Local File`
- `AgentILS: Open Local File`
- `AgentILS: Install Prompt Template`

## Behavior

- The extension activates only when `vscode.env.remoteName` is present.
- In non-remote windows it becomes inert and registers no commands.
- Local prompt roots can be overridden through `agentilsUiHelper.promptRoots`.
