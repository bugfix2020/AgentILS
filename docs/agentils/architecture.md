# AgentILS Architecture

## Layers

1. VS Code customization layer: `.github/instructions`, `.github/agents`, `.github/prompts`, `.github/hooks`
2. AgentILS runtime layer: MCP server, state store, budget, policy, audit, verification
3. Product control plane layer: auth, claims, quotas, billing, dashboards, policy distribution

## MVP focus

- explicit run state
- taskCard and handoffPacket resources
- approval and feedback gates
- budget and policy checks
- verify-before-done discipline
