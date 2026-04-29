---
name: agentils.proposal-create
description: '创建新提案'
agent: agentils.code
---

<agentilsRequestDynamicAction>
{
  "action": "spawnWorker",
  "params": {
    "subagent": "agentils.subagent.proposal-collector",
    "prompt": "询问用户详情。"
  }
}
</agentilsRequestDynamicAction>

请直接调用 `#tool:agentils.agentils-vscode/agentilsRequestDynamicAction` 工具，将 <agentilsRequestDynamicAction/> 作为参数，来协助处理提案。

不要发散，只需专注工具调用。
