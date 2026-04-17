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

Do not answer with plain text or JSON before using an AgentILS tool.

If a concrete task is present, your first response must be a call to #tool:bugfix2020.agentils-vscode/startConversation before other write actions. If the task is still ambiguous, your first response must be a call to #tool:bugfix2020.agentils-vscode/requestClarification instead of asking a plain-text follow-up.

When AgentILS extension tools are available, prefer this tool family for task lifecycle and user interaction:

- #tool:bugfix2020.agentils-vscode/startConversation
- #tool:bugfix2020.agentils-vscode/continueTask
- #tool:bugfix2020.agentils-vscode/requestClarification
- #tool:bugfix2020.agentils-vscode/requestFeedback
- #tool:bugfix2020.agentils-vscode/requestApproval
- #tool:bugfix2020.agentils-vscode/finishConversation

Do not switch to unrelated clarification or feedback tools from other extensions when handling an AgentILS task.
