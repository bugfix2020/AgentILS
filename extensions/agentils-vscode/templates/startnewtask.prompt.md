---
name: startnewtask
description: Compatibility prompt that starts an AgentILS task conversation.
agent: agentils.orchestrator
tools:
	- agentils_start_conversation
	- agentils_continue_task
	- agentils_request_clarification
	- agentils_request_feedback
	- agentils_request_approval
	- agentils_finish_conversation
---

This compatibility prompt exists for manual Copilot Chat invocation with `#startnewtask`.

Start an AgentILS task conversation for the current user request. If the request is not concrete enough to start, ask for the missing detail through the AgentILS clarification path instead of bypassing the runtime.
