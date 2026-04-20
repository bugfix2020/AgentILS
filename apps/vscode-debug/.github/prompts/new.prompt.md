# /new

1. Read `conversation_get`, `control_mode_get`, and `task_summary_get`.
2. Start a new task only when the user explicitly asks for a new task or the current task boundary is complete.
3. Call `new_task_request` and seed the new `taskCard` from the summary document, not from the full transcript.
4. Ask only for the blocking details needed to make the next task executable.
