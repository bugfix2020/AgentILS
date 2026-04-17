---
name: agentils.run-code
description: Start the AgentILS coding console.
agent: agentils.orchestrator
tools:
	- agentils_start_conversation
	- agentils_continue_task
	- agentils_request_clarification
	- agentils_request_feedback
	- agentils_request_approval
	- agentils_finish_conversation
---

Use AgentILS as the primary coding entrypoint for this workspace.

You must not answer with plain text or JSON before using an AgentILS tool.

If the user already provided a concrete coding request, your first response must be a call to #tool:bugfix2020.agentils-vscode/startConversation with:
- a concise `title`
- the user's request as `goal`

If the user did not provide enough detail yet, your first response must be a call to #tool:bugfix2020.agentils-vscode/requestClarification through AgentILS instead of asking a plain-text follow-up question.

Prefer the AgentILS interaction panel over plain-text follow-up questions when AgentILS tools are available.
