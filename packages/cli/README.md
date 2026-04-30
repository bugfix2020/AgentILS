# @agent-ils/cli

**AgentILS** = _Intelligent Logical System_ (acronym borrowed from aviation
_Instrument Landing System_).

Drop-in replacement for the legacy VS Code extension installer.

```bash
npx @agent-ils/cli init --vscode --workspace ./my-project
```

Writes `.vscode/mcp.json` (registers `agentils` MCP server via stdio) and
`.github/prompts/agentils.prompt.md` (behavioural rules template).
