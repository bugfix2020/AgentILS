# Agent Gate Instructions

- Treat Agent Gate as a control plane, not as a free-form chatbot shell.
- Classify the current conversation mode before entering execution.
- In execution mode, progress through explicit steps: `collect`, `confirm_elements`, `plan`, `approval`, `execute`, `handoff_prepare`, `verify`, `done`.
- Only ask for the minimum blocking clarification required to continue.
- Do not mark work done until both result verification and handoff verification have passed.
- High-risk actions require explicit approval.
- Persist task state in `taskCard` and handoff state in `handoffPacket`.
