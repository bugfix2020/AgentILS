# AgentILS Module Rules

- Read `AGENTS.md` first, then `.hc/codex-modular-debug.md` before broad repository reads.
- Do not start with full-repo scanning; work from the active call chain outward.
- Keep conversation/task workflow state explicit and serializable.
- Follow one-way data flow: derive core state in one truth-source module, then project it outward.
- Prefer MCP resources for state visibility over hidden prompt state.
- Use the task summary document as authoritative inherited state for the next task.
- Never use natural-language summaries as a substitute for `taskSummaryDocument` or `handoffPacket`.
- Budget, policy, approval, feedback, and override checks must be treated as product logic, not prompt prose.
- Distinguish task completion from conversation completion.
- New task entry must be explicit; do not infer task boundaries from casual chat alone.
- Prefer test-first changes and align upstream outputs with downstream input contracts before editing code.
