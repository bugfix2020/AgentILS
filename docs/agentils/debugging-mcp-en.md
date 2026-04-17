# AgentILS MCP Server Debugging Guide

This document covers the build, run, and debug workflow for the AgentILS core MCP Server.

---

## 1. Prerequisites

### 1.1 Requirements

| Dependency | Minimum Version |
|------------|----------------|
| Node.js | 20+ |
| npm | 9+ |
| TypeScript | 5.8+ |

### 1.2 Install Dependencies

```bash
# Run from the project root
npm install
```

---

## 2. Building the Project

AgentILS uses `tsup` as its bundler, outputting ESM artifacts to the `dist/` directory.

### 2.1 Full Build

```bash
npm run build
```

After building, `dist/index.js` is the MCP Server entrypoint.

### 2.2 Watch Mode (Recommended for Development)

```bash
npm run dev
```

This runs `tsup --watch`, monitoring `src/` for changes and rebuilding incrementally.

### 2.3 Type Check Only (No Output)

```bash
npm run typecheck
```

---

## 3. Running the MCP Server

AgentILS MCP Server supports two transport modes: **stdio** and **Streamable HTTP**.

### 3.1 stdio Mode

stdio is the default transport used by VS Code MCP clients. The server communicates via stdin/stdout.

```bash
# Using built artifacts
npm start
# equivalent to
node dist/index.js
```

You can also run TypeScript source directly with `tsx` (no build needed):

```bash
npx tsx src/index.ts
```

> **Note**: In stdio mode, all log output goes to **stderr** to avoid corrupting the MCP length-prefixed framing protocol on stdout.

### 3.2 Streamable HTTP Mode

HTTP mode is ideal for standalone debugging, integration testing, and tool invocation verification.

```bash
# Using built artifacts
npm run start:http
# equivalent to
node dist/index.js --http

# Using tsx directly (recommended for development)
npm run dev:http
# equivalent to
tsx src/index.ts --http
```

Defaults to `127.0.0.1:8788`. Override with environment variables:

```bash
AGENT_GATE_HTTP_HOST=0.0.0.0 AGENT_GATE_HTTP_PORT=9000 npm run start:http
```

### 3.3 Health Check

After starting in HTTP mode, verify server status via the `/health` endpoint:

```bash
curl http://127.0.0.1:8788/health
# Returns: {"ok":true,"name":"AgentILS","transport":"streamable-http","endpoint":"/mcp"}
```

### 3.4 Smoke Test

Quickly verify that built artifacts load correctly:

```bash
npm run smoke
# Returns: {"ok":true,"name":"AgentILS"}
```

---

## 4. Debugging the MCP Server

### 4.1 Using MCP Inspector (Recommended)

[MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) is the official interactive debugging UI for MCP servers. It lets you visually invoke tools, prompts, and resources.

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

The Inspector opens a browser panel listing all registered tools. You can:
- View schemas for all tools, prompts, and resources
- Manually input parameters and invoke any tool
- Inspect return values and error messages

To debug from TypeScript source:

```bash
npx @modelcontextprotocol/inspector npx tsx src/index.ts
```

### 4.2 VS Code Breakpoint Debugging

1. **Confirm sourcemaps are enabled** (enabled by default): `tsup.config.ts` → `sourcemap: true`

2. **Launch Node.js with inspect flag**:

```bash
node --inspect dist/index.js --http
```

3. **Attach the VS Code debugger**:
   - Press `Cmd+Shift+P` → "Debug: Attach to Node Process"
   - Or use this launch.json configuration:

```jsonc
{
  "name": "Attach to AgentILS HTTP",
  "type": "node",
  "request": "attach",
  "port": 9229,
  "sourceMaps": true,
  "outFiles": ["${workspaceFolder}/dist/**/*.js"]
}
```

4. **Set breakpoints** in key files:
   - `src/gateway/tools.ts` — Tool registration and entrypoints
   - `src/gateway/context.ts` — Request context creation
   - `src/orchestrator/orchestrator.ts` — Orchestration logic

### 4.3 Logging and Error Output

In stdio mode:
- MCP protocol messages go to stdout
- Errors and logs go to stderr
- Uncaught exceptions and unhandled rejections are written to stderr

In HTTP mode:
- Logs go to the console (stdout/stderr)
- HTTP responses contain error details

Redirect stderr to collect logs:

```bash
node dist/index.js 2>agentils-server.log
```

---

## 5. Running Tests

### 5.1 Unit Tests

AgentILS uses the Node.js built-in test runner with `tsx`:

```bash
npm run test:unit
```

This runs all test files under `test/**/*.test.ts`.

### 5.2 Run a Single Test File

```bash
npx tsx --test test/gateway/request-context.test.ts
```

### 5.3 Filtered Tests

```bash
npx tsx --test --test-name-pattern="approval" test/**/*.test.ts
```

---

## 6. Architecture Quick Reference

### 6.1 Entrypoint Chain

```
src/index.ts
  └─ startIfEntrypoint()
       ├─ --http → startStreamableHttpServer()
       └─ default → startStdioServer()

startStdioServer():
  createAgentGateServer()  → Creates McpServer, registers tools/prompts/resources
  StdioServerTransport     → stdin/stdout communication

startStreamableHttpServer():
  createAgentGateServer()  → Creates independent runtime per HTTP session
  StreamableHTTPServerTransport → HTTP streaming communication
```

### 6.2 Core Modules

| Module | Path | Responsibility |
|--------|------|---------------|
| Gateway | `src/gateway/` | MCP Server creation, tool registration, transport layer |
| Orchestrator | `src/orchestrator/` | Conversation, task, control mode, verification orchestration |
| Store | `src/store/` | In-memory state storage (runs, taskCards, handoffs) |
| Control | `src/control/` | Control modes, gate evaluation, mode transitions |
| Types | `src/types/` | Core type contract definitions |

### 6.3 Common Debugging Entry Points

| Scenario | Start File |
|----------|-----------|
| task start not working | `src/gateway/tools.ts` → `src/orchestrator/conversation-orchestrator.ts` |
| approval/feedback issues | `src/gateway/tools.ts` → `src/orchestrator/control-mode-orchestrator.ts` |
| verify/summary problems | `src/orchestrator/verification-orchestrator.ts` → `src/store/summary-store.ts` |
| conversation state incorrect | `src/store/conversation-store.ts` |

---

## 7. Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENT_GATE_HTTP_HOST` | HTTP mode listen address | `127.0.0.1` |
| `AGENT_GATE_HTTP_PORT` | HTTP mode listen port | `8788` |

---

## 8. FAQ

### Q: Server exits immediately in stdio mode

Ensure stdin remains open. AgentILS already calls `process.stdin.resume()` to prevent the process from exiting due to stdin idle. If it still exits, check whether another part of the code is consuming stdin.

### Q: Cannot find dist/index.js after build

Run `npm run build` and verify tsup completes successfully. If it fails, check the entry configuration in `tsup.config.ts`.

### Q: MCP Inspector connection fails

Ensure you have the latest Inspector version: `npx @modelcontextprotocol/inspector@latest`. Also confirm Node.js >= 20.
