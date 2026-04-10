# AgentILS Module Rules

- Keep conversation/task workflow state explicit and serializable.
- Prefer MCP resources for state visibility over hidden prompt state.
- Use the task summary document as authoritative inherited state for the next task.
- Never use natural-language summaries as a substitute for `taskSummaryDocument` or `handoffPacket`.
- Budget, policy, approval, feedback, and override checks must be treated as product logic, not prompt prose.
- Distinguish task completion from conversation completion.
- New task entry must be explicit; do not infer task boundaries from casual chat alone.
