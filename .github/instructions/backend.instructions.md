# Backend Rules

- Favor deterministic state transitions over implicit inference.
- Persist task and conversation state changes as append-only audit events where possible.
- Keep policy and budget checks side-effect free unless explicitly applying updates.
- Treat `task_done` and `conversation_done` as separate states.
