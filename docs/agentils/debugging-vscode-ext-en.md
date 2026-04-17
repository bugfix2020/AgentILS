# AgentILS VS Code Extension Debugging Guide

This document covers the build and debug workflow for the current AgentILS VS Code extension surface.

Current scope:
- `extensions/agentils-vscode` — Main extension providing Task Console, LM Tools, MCP runtime access, and MCP elicitation bridge

Removed scope:
- `agentils-ui-helper` no longer exists in this repository and is not part of the current debug flow

---

## 1. Prerequisites

| Dependency | Minimum Version |
|------------|----------------|
| VS Code | 1.90.0+ |
| Node.js | 20+ |
| pnpm | 10+ |

Install dependencies:

```bash
pnpm install
```

---

## 2. Build

Recommended:

```bash
pnpm build
```

Or build the VS Code extension only:

```bash
pnpm --filter agentils-vscode build
```

Useful checks:

```bash
pnpm --filter agentils-vscode typecheck
pnpm --filter @agentils/mcp test
```

---

## 3. User-Facing End-to-End Flow

This is the recommended validation flow from a user point of view:

1. Install dependencies and build the repo.
2. Run the CLI installer so VS Code receives the AgentILS prompts and MCP config.
3. Start the local VS Code extension with `F5`.
4. In Copilot Chat, invoke `/agentils.run-code`.
5. Confirm the tool invocation and expect the AgentILS WebView to open.

Run these commands from the repository root in order:

```bash
pnpm install
pnpm build
pnpm agentils:inject:vscode
```

What each step does:

1. `pnpm install` installs workspace dependencies.
2. `pnpm build` builds the MCP runtime and the VS Code extension.
3. `agentils inject vscode` installs AgentILS prompts and MCP config for VS Code.

Before launching the extension, verify these two things:

1. `packages/mcp/dist/index.js` exists.
2. `~/Library/Application Support/Code/User/prompts/agentils.run-code.prompt.md` exists.

To clean the VS Code injection later:

```bash
pnpm agentils:uninstall:vscode
```

---

## 4. Start The Extension Locally

The workspace now ships a single launch configuration:

- `AgentILS: VS Code Extension`

How to use it:

1. Open the **Run and Debug** panel.
2. Select **AgentILS: VS Code Extension**.
3. Press `F5`.

This will:
- run `prepare:agentils-extensions`
- build the workspace packages
- build `extensions/agentils-vscode`
- start an Extension Development Host that loads only `agentils-vscode`
- open the separate debug workspace at `apps/vscode-debug`

---

## 5. What The User Should Do In Copilot Chat

Inside the Extension Development Host:

1. Open Copilot Chat.
2. Type exactly:

```text
/agentils.run-code welcome onboarding
```

3. When VS Code shows the AgentILS tool confirmation, click `Continue`.
4. Expect the `AgentILS Task Console` WebView panel to open.

You can also try these entrypoints:

- `/agentils.run-task welcome onboarding`
- `#startnewtask`

The preferred path for the current VS Code flow is `/agentils.run-code`.

---

## 6. Expected Result

If the setup is correct, the user-visible sequence is:

1. `/agentils.run-code` appears as a Copilot prompt entry.
2. VS Code asks to confirm the `agentils_start_conversation` tool call.
3. After confirmation, the `AgentILS Task Console` WebView opens.
4. Further clarification, feedback, and approval steps continue inside the AgentILS panel.

---

## 7. Runtime Expectations

The active VS Code chain is:

`Copilot prompt or AgentILS custom prompt -> agentils-vscode LM tool -> MCP runtime -> AgentILS WebView -> MCP runtime -> Copilot`

Key files:

- `extensions/agentils-vscode/src/extension.ts`
- `extensions/agentils-vscode/src/lm-tools/index.ts`
- `extensions/agentils-vscode/src/session/conversation-session-manager.ts`
- `extensions/agentils-vscode/src/task-console-panel.ts`
- `extensions/agentils-vscode/src/mcp-elicitation-bridge.ts`
- `packages/mcp/src/gateway/tools.ts`

---

## 8. Breakpoint Suggestions

Set breakpoints in:

- `extensions/agentils-vscode/src/extension.ts` for activation
- `extensions/agentils-vscode/src/lm-tools/index.ts` for tool invocation
- `extensions/agentils-vscode/src/session/conversation-session-manager.ts` for panel-open behavior
- `extensions/agentils-vscode/src/task-console-panel.ts` for WebView message handling
- `packages/mcp/src/gateway/tools.ts` for MCP tool entry

---

## 9. Common Checks

If `/agentils.run-code` appears in Copilot but no WebView opens:

1. Confirm the extension development host is running the `agentils-vscode` extension.
2. Confirm `packages/mcp/dist/index.js` exists.
3. Confirm prompts were installed into `~/Library/Application Support/Code/User/prompts`.
4. Reload the VS Code window after prompt installation.
5. Check whether VS Code showed a confirmation dialog for `agentils_start_conversation` and it was cancelled.

If the extension activates but MCP calls fail:

1. Rebuild with `pnpm build`.
2. Check `agentils.runtime.serverModulePath` if you overrode it.
3. Inspect the Output channel and developer tools console.
4. If you want to fully reset the VS Code-side injection, run `pnpm agentils:uninstall:vscode` and then `pnpm agentils:inject:vscode` again.

---

## 10. Historical Note

Some reference documents in `docs/agentils/` still discuss a helper-style UI extension because they analyze external reference implementations. Those documents are architectural references, not statements about the current AgentILS repository layout.
