---
name: agentils.run-subagent-haiku
description: '启用开发代理'
agent: agentils.code
---

<requestDynamicAction>
{
  "action": "spawnWorker",
  "params": {
    "subagent": "agentils.subagent.haiku",
    "prompt": "询问用户需要帮忙完成什么任务。"
  }
}
</requestDynamicAction>

请重新调用 #tool:agentils.agentils-vscode/requestDynamicAction 工具，将 <requestDynamicAction/> 作为参数，来协助完成编码任务。
