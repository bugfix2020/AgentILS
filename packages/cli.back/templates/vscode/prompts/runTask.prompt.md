---
name: runtask
tools:
  - agentils/*
agent: agentils.loop
description: Start or resume the single AgentILS V1 task loop.
argument-hint: 输入任务，或直接运行 /runtask 进入 AgentILS loop
---

IMPORTANT: Do NOT emit any natural language reply before calling tools.

Step 1 — IMMEDIATELY call `#tool:agentils/state_get` (no arguments).
Step 2 — IMMEDIATELY in the same turn call `#tool:agentils/run_task_loop`.
          Do not output any text between the two tool calls.
          Do not output "please wait" / "正在..." / "已收到" style messages.

Rules:

- The AgentILS MCP server is the single source of truth. The VS Code extension
  (if installed) only renders the Webview and bridges MCP elicitation requests.
- If there is an active task, resume it with `run_task_loop`.
- If there is no active task, call `run_task_loop` with the current user request
  as `userIntent`.
- If the user only typed `/runtask` or `/runTask` and provided no extra text,
  still call `run_task_loop` with `userIntent: "New task"`.
- Do not stop after `state_get`.
- Do not use any other AgentILS prompt or tool family.
