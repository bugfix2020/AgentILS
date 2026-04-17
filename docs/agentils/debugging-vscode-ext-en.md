# AgentILS VS Code Extension Debugging Guide

This document covers the build and debug workflow for the two AgentILS VS Code extensions:
- **agentils-vscode** — Main extension providing Task Console, LM Tools, and MCP Elicitation Bridge
- **agentils-ui-helper** — UI helper extension providing local prompt and file bridge commands

---

## 1. Prerequisites

### 1.1 Requirements

| Dependency | Minimum Version |
|------------|----------------|
| VS Code | 1.90.0+ |
| Node.js | 20+ |
| npm | 9+ |

### 1.2 Install Dependencies

```bash
# Root dependencies (core MCP Server)
npm install

# agentils-vscode extension dependencies
cd extensions/agentils-vscode && npm install && cd ../..
```

> `agentils-ui-helper` is a pure JavaScript extension with no additional dependencies to install.

---

## 2. Project Structure

```
extensions/
├── agentils-vscode/          # Main extension (TypeScript)
│   ├── package.json          # Extension manifest (commands, languageModelTools)
│   ├── tsconfig.json         # CommonJS output, target ES2022
│   ├── src/
│   │   ├── extension.ts      # Activation entry
│   │   ├── commands.ts       # Command registration
│   │   ├── lm-tools/         # Language Model Tools registration
│   │   ├── session/          # Session management
│   │   ├── interaction-channel/ # Interaction channel
│   │   ├── mcp-elicitation-bridge.ts  # MCP bridge
│   │   ├── task-service-client.ts     # Task service client
│   │   └── status-surface.ts # Status bar UI
│   └── dist/                 # Build output
│
└── agentils-ui-helper/       # UI helper extension (pure JavaScript)
    ├── package.json          # extensionKind: ["ui"]
    └── src/
        ├── extension.js      # Activation entry
        ├── local-prompts.js  # Local prompt reading
        ├── local-files.js    # Local file operations
        ├── local-paths.js    # Path resolution
        └── constants.js      # Constants
```

---

## 3. Building Extensions

### 3.1 One-Step Build (Recommended)

The project provides preconfigured VS Code Tasks that build all dependencies in order:

1. Press `Cmd+Shift+P` → "Tasks: Run Task"
2. Select **prepare:agentils-extensions**

This executes sequentially:
1. `build:root` — Build core MCP Server (`npm run build`)
2. `build:agentils-vscode` — Build the main VS Code extension
3. `check:agentils-ui-helper` — Syntax-check the UI Helper

### 3.2 Manual Build

```bash
# 1. Build core MCP Server
npm run build

# 2. Build agentils-vscode extension
cd extensions/agentils-vscode
npm run build
cd ../..

# 3. Check agentils-ui-helper (pure JS, no compilation needed)
npm run check:ui-helper
```

### 3.3 Type Checking

```bash
# Type-check agentils-vscode extension
npm run typecheck:vscode-host

# Check all surfaces (vscode-host + ui-helper)
npm run verify:surfaces
```

---

## 4. Debugging Extensions

### 4.1 Using Preconfigured Launch Configurations

The `.vscode/launch.json` provides three debug modes:

#### Debug Main Extension

1. Open the **Run and Debug** panel (`Cmd+Shift+D`)
2. Select **"AgentILS: VS Code Extension"**
3. Press `F5` to start

This will:
- Automatically run the `prepare:agentils-extensions` pre-launch task
- Launch the Extension Development Host
- Load only `extensions/agentils-vscode`
- Map source maps to `extensions/agentils-vscode/dist/**/*.js`

#### Debug UI Helper Extension

1. Select **"AgentILS: UI Helper Extension"**
2. Press `F5`

#### Debug Both Extensions Together

1. Select **"AgentILS: Both Extensions"**
2. Press `F5`

This loads both `agentils-vscode` and `agentils-ui-helper` in the same Extension Development Host.

### 4.2 Breakpoint Debugging

1. **Set breakpoints** in source files:
   - `extensions/agentils-vscode/src/extension.ts` — Activation flow
   - `extensions/agentils-vscode/src/commands.ts` — Command handling
   - `extensions/agentils-vscode/src/lm-tools/` — Language Model Tool invocations
   - `extensions/agentils-vscode/src/session/` — Session management logic
   - `extensions/agentils-vscode/src/mcp-elicitation-bridge.ts` — MCP bridge

2. **Verify sourceMap is enabled**: `extensions/agentils-vscode/tsconfig.json` → `"sourceMap": true`

3. **Trigger actions in the Extension Development Host**:
   - `Cmd+Shift+P` → Run AgentILS commands
   - Or use `#agentils_start_conversation` and other LM Tools in Copilot Chat

4. **The debugger will pause at breakpoints**, allowing you to inspect call stacks, variable values, etc.

### 4.3 Viewing Extension Output Logs

In the Extension Development Host:

1. Open the Output panel (`Cmd+Shift+U`)
2. Select the relevant output channel from the dropdown

You can also view console output in Developer Tools:
- `Cmd+Shift+P` → "Developer: Toggle Developer Tools"

---

## 5. agentils-vscode Extension Details

### 5.1 Activation Flow

```
extension.ts activate()
  ├─ Create RepoBackedAgentILSTaskServiceClient
  ├─ Create ConversationSessionManager
  ├─ Create LocalPanelInteractionChannel (WebView interaction panel)
  ├─ Create AgentILSStatusSurface (status bar)
  ├─ registerAgentILSCommands() — Register VS Code commands
  ├─ registerAgentILSLanguageModelTools() — Register LM Tools
  ├─ registerAgentILSPromptPackCommands() — Register Prompt Pack commands
  ├─ Create AgentILSMcpElicitationBridge — MCP bridge
  └─ sessionManager.refresh() — Refresh session state
```

### 5.2 MCP Server Path Resolution

The extension automatically locates the MCP Server entrypoint, in order of priority:
1. `{extensionPath}/../../dist/index.js` — Development layout (monorepo sibling directory)
2. `{workspaceFolder}/dist/index.js` — Workspace build output

> **Debugging tip**: If the extension reports "AgentILS runtime is unavailable", the MCP Server build artifacts were not found. Make sure to run `npm run build` first.

### 5.3 Registered Commands

| Command | Description |
|---------|------------|
| `agentils.openTaskConsole` | Open Task Console |
| `agentils.newTask` | Create new task |
| `agentils.continueTask` | Continue current task |
| `agentils.markTaskDone` | Mark task done |
| `agentils.acceptOverride` | Accept Override |
| `agentils.openSummary` | Open Summary |
| `agentils.installPromptPack` | Install Prompt Pack |

### 5.4 Registered Language Model Tools

| Tool | Description |
|------|------------|
| `agentils_start_conversation` | Start a new AgentILS task conversation |
| `agentils_continue_task` | Continue the current task |
| `agentils_request_clarification` | Request user clarification |

---

## 6. agentils-ui-helper Extension Details

### 6.1 Characteristics

- `extensionKind: ["ui"]` — Runs on the UI side (local desktop environment)
- Pure JavaScript, no compilation needed
- Provides local filesystem access capabilities

### 6.2 Registered Commands

| Command | Description |
|---------|------------|
| `agentilsUiHelper.getLocalPrompts` | Read local prompt files |
| `agentilsUiHelper.readLocalFile` | Read local file contents |
| `agentilsUiHelper.openLocalFile` | Open a local file in the editor |
| `agentilsUiHelper.installPromptTemplate` | Install a prompt template |

### 6.3 Configuration

| Setting | Type | Default | Description |
|---------|------|---------|------------|
| `agentilsUiHelper.promptRoots` | `string[]` | `[]` | Custom prompt directory paths |
| `agentilsUiHelper.defaultPromptName` | `string` | `"agentils-task"` | Default template name for installation |

---

## 7. Combined Debugging: MCP Server + VS Code Extension

When you need to debug both the MCP Server and VS Code extension simultaneously:

### Option A: HTTP Mode (Recommended)

1. **Start the MCP Server separately (HTTP mode)**:
```bash
node --inspect=9230 dist/index.js --http
```

2. **Launch extension debugging**: Select "AgentILS: Both Extensions" → `F5`

3. **Attach to MCP Server**: Start a new debug session in VS Code using "Attach to Node Process" on port 9230

4. You can now set breakpoints in both extension code and MCP Server code.

### Option B: stdio Mode

1. **Launch extension debugging**: Select "AgentILS: VS Code Extension" → `F5`
2. The extension automatically spawns the MCP Server as a child process via stdio
3. Set breakpoints in extension-side code to debug interaction logic
4. MCP Server logs go to stderr and can be viewed in the extension's Output channel

---

## 8. FAQ

### Q: Extension Development Host fails to start

- Verify that the `prepare:agentils-extensions` task completed successfully
- Confirm `extensions/agentils-vscode/dist/extension.js` exists
- Check VS Code version >= 1.90.0

### Q: LM Tool invocations have no response

- Confirm the MCP Server is built (`npm run build`)
- Check the Developer Tools Console in the Extension Development Host
- Set breakpoints in `src/lm-tools/` and `src/session/` to trace the issue

### Q: agentils-ui-helper extension not loading

- Confirm you used "AgentILS: Both Extensions" or "AgentILS: UI Helper Extension" launch config
- Verify `extensions/agentils-ui-helper/src/extension.js` syntax: `npm run check:ui-helper`

### Q: WebView panel not showing

- In the Extension Development Host, press `Cmd+Shift+P` → "AgentILS: Open Task Console"
- Check if `LocalPanelInteractionChannel` was created successfully in `extension.ts`
- Inspect error messages in Developer Tools
