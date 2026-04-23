---
name: agentils.proposal-create
description: '创建新提案'
agent: agentils.code
---

<requestDynamicAction>
{
  "action": "spawnWorker",
  "params": {
    "subagent": "agentils.subagent.proposal-collector",
    "prompt": "询问用户详情。"
  }
}
</requestDynamicAction>

请直接调用 `#tool:agentils.agentils-vscode/requestDynamicAction` 工具，将 <requestDynamicAction/> 作为参数，来协助处理提案。

不要发散，只需专注工具调用。
