# /start-run

1. Read the current conversation state with `conversation_get`.
2. Read control mode with `control_mode_get` and inherited state with `task_summary_get`.
3. Decide whether this is a continuation of the active task or a new task boundary.
4. If a new task is justified, call `new_task_request` and initialize `taskCard` with the minimum blocking details.
5. Record explicit constraints, assumptions, and verification requirements.
