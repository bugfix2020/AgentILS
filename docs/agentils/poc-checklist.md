# PoC Checklist

- MCP server starts over stdio
- `run_start` creates run, taskCard, handoffPacket
- `taskcard_get` and `handoff_get` resources are readable
- `policy_check` marks risky tool names correctly
- `budget_check` flags budget overflow
- `verify_run` blocks completion before user confirmation
- VS Code hook files are recognized and executable
