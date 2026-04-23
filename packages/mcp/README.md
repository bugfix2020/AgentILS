# @agentils/mcp

**AgentILS** = *Intelligent Logical System* (acronym borrowed from aviation
*Instrument Landing System*).

Core MCP server. Stdio + HTTP dual transport. JSON-file persisted state.
Heartbeat-based long-running tool support.

## Run

```bash
pnpm --filter @agentils/mcp build
pnpm --filter @agentils/mcp start          # both stdio + http
pnpm --filter @agentils/mcp start:http     # http only (for webview tests)
```

State file: `~/.agentils/state.json`. HTTP bridge: `http://127.0.0.1:8788`.
