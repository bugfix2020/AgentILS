# @agent-ils/mcp

**AgentILS** = _Intelligent Logical System_ (acronym borrowed from aviation
_Instrument Landing System_).

Core MCP server. Stdio + HTTP dual transport. JSON-file persisted state.
Heartbeat-based long-running tool support.

## Run

```bash
pnpm --filter @agent-ils/mcp build
pnpm --filter @agent-ils/mcp start          # both stdio + http
pnpm --filter @agent-ils/mcp start:http     # http only (for webview tests)
```

State file: `~/.agentils/state.json`. HTTP bridge: `http://127.0.0.1:8788`.
