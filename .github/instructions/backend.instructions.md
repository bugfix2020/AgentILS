# Backend Rules

- Favor deterministic state transitions over implicit inference.
- Persist run state changes as append-only audit events where possible.
- Keep policy and budget checks side-effect free unless explicitly applying updates.
