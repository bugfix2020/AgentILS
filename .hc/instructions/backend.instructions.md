# Backend Rules

- Read `AGENTS.md` and `.hc/codex-modular-debug.md` before expanding context.
- Work by active chain and module boundary; avoid whole-repo scans unless strictly necessary.
- Favor deterministic state transitions over implicit inference.
- Prefer type contracts over inferred behavior.
- Keep conversation state derived from `packages/mcp/src/store/conversation-store.ts` as the single truth source.
- Keep request-scoped interaction behavior anchored in `packages/mcp/src/gateway/context.ts`.
- Persist task and conversation state changes as append-only audit events where possible.
- Keep policy and budget checks side-effect free unless explicitly applying updates.
- Treat `task_done` and `conversation_done` as separate states.
- Gateway should adapt protocol input and create request context, but should not directly mutate domain state.
- Use test-first development and validate the targeted chain with tests and typecheck after changes.
