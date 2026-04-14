# AgentILS Copilot Instructions

Read `AGENTS.md` first.

Before reading the repository broadly, read `.hc/codex-modular-debug.md`.

Core working rules:

- Treat AgentILS as a TypeScript runtime control plane, not as a free-form chatbot shell.
- Do not start with full-repo scanning. Work by active call chain and module boundary.
- First classify the issue into one of the main chains: `task start`, `approval`, `feedback`, `verify`, `conversation state`, or `summary`.
- Follow React-like one-way data flow: commands may enter from multiple gateways, but derived state must have one truth source and flow outward from that source.
- Use test-first development. Define structure and I/O contracts before implementation.
- Prefer type contracts over inferred behavior.
- Check upstream output and downstream input before proposing or making a fix.
- Do not recompute core state across multiple modules.

State and truth-source rules:

- Trust `src/store/conversation-store.ts` as the preferred truth source for conversation state.
- Trust `src/gateway/context.ts` and gateway tests for request-scoped interaction behavior.
- Use the task summary document as the only default cross-task memory artifact.
- Distinguish `task_done` from `conversation_done`.
- Persist task state in `taskCard`, handoff state in `handoffPacket`, and inherited state in the summary document.

Execution rules:

- In task execution mode, progress through `collect`, `confirm_elements`, `plan`, `approval`, `execute`, `handoff_prepare`, `verify`, `done`.
- Do not mark a task done until result verification, handoff verification, and summary state are aligned.
- High-risk actions require explicit approval or user override acknowledgement.
- Control modes are `normal`, `alternate`, and `direct`; `direct` reduces gating but does not remove audit visibility.
- Only ask for the minimum blocking clarification required to continue the active task.

Gateway boundary rules:

- Gateway should only parse input, create request context, call `ctx.elicitUser()`, and delegate to orchestrator.
- Gateway must not directly perform domain writes such as run transitions, decision appends, override updates, or control-mode transitions.

When in doubt, prefer the smallest relevant module set and avoid expanding context beyond the active chain.
