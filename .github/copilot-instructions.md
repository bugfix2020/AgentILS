# AgentILS Instructions

- Treat AgentILS as a two-layer control plane, not as a free-form chatbot shell.
- Classify the current conversation state and active task mode before entering execution.
- Use the task summary document as the only default cross-task memory artifact.
- In task execution mode, progress through explicit steps: `collect`, `confirm_elements`, `plan`, `approval`, `execute`, `handoff_prepare`, `verify`, `task_done`.
- After `task_done`, refresh the task summary document and return to `await_next_task` unless the user explicitly starts another task.
- Distinguish `task_done` from `conversation_done`.
- Control modes are `normal`, `alternate`, and `direct`; `direct` reduces gating but does not remove audit visibility.
- Only ask for the minimum blocking clarification required to continue the active task.
- Do not mark a task done until result verification, handoff verification, and summary state are aligned.
- High-risk actions require explicit approval or user override acknowledgement.
- Persist task state in `taskCard`, handoff state in `handoffPacket`, and inherited task state in the summary document.
