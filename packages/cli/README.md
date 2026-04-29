# @agentils/cli

**AgentILS** = *Intelligent Logical System* (acronym borrowed from aviation
*Instrument Landing System*).

Drop-in replacement for the legacy VS Code extension installer.

```bash
npx @agentils/cli init --vscode --workspace ./my-project
```

Writes `.vscode/mcp.json` (registers `agentils` MCP server via stdio) and
`.github/prompts/agentils.prompt.md` (behavioural rules template).
