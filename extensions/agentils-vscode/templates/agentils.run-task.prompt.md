---
name: agentils.run-task
description: Start an AgentILS task conversation.
agent: agentils.orchestrator
tools:
	- agentils_start_conversation
	- agentils_continue_task
	- agentils_request_clarification
	- agentils_request_feedback
	- agentils_request_approval
	- agentils_finish_conversation
---

Read the current AgentILS runtime state if needed, then start or continue the appropriate AgentILS task flow. If the user has not yet provided a concrete task, ask for the missing detail through the proper AgentILS interaction path.

When AgentILS extension tools are available, prefer this tool family for task lifecycle and user interaction:

- `agentils_start_conversation`
- `agentils_continue_task`
- `agentils_request_clarification`
- `agentils_request_feedback`
- `agentils_request_approval`
- `agentils_finish_conversation`

Do not switch to unrelated clarification or feedback tools from other extensions when handling an AgentILS task.