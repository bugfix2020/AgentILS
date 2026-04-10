# Agent Gate Module Rules

- Keep workflow state explicit and serializable.
- Prefer MCP resources for state visibility over hidden prompt state.
- Never use natural-language summaries as a substitute for `handoffPacket`.
- Budget, policy, and audit checks must be treated as product logic, not prompt prose.
