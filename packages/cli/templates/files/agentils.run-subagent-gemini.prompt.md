---
name: agentils.run-subagent-gemini
description: '启用开发代理'
agent: agentils.code
---

<agentilsRequestDynamicAction>
{
  "action": "spawnWorker",
  "params": {
    "subagent": "agentils.subagent.gemini",
    "prompt": "询问用户需要帮忙完成什么任务。"
  }
}
</agentilsRequestDynamicAction>

请重新调用 #tool:agentils.agentils-vscode/agentilsRequestDynamicAction 工具，将 <agentilsRequestDynamicAction/> 作为参数，来协助完成编码任务。
