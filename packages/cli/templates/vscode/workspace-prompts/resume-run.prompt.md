# /resume-run

1. Read `taskCard`, `handoffPacket`, `control_mode_get`, and `task_summary_get`.
2. Resume from `currentStep`.
3. Do not create a new task unless the user explicitly requests one.
4. Do not re-scan the entire task history unless the handoff or summary is insufficient.
