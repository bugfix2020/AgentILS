# Agent Gate

Agent Gate 是一个面向 VS Code agent 工作流的 MCP control plane 骨架。当前版本重点不是“多功能工具箱”，而是把任务推进纪律显式化：

- 先分诊模式，再进入执行
- 用 `taskCard` 和 `handoffPacket` 承载结构化状态
- 用 budget、policy、approval、verify 控制 run 生命周期
- 用 hooks 为“未确认不得结束”预留硬门禁

## GitHub 仓库信息

当前公开仓库是：

- [bugfix2020/AgentILS](https://github.com/bugfix2020/AgentILS)

当前存在一层命名分离：

- GitHub 仓库名：`AgentILS`
- 当前 npm 包名：`agent-gate`
- 当前 MCP server 名：`agent-gate`

这样做是为了先保持运行入口和 VS Code MCP 配置稳定。后续如果要统一品牌和发布名，可以再单独做一次重命名迁移。

## 当前范围

当前仓库已经落下的核心模块：

- [src/gateway/gateway.ts](/Users/liuyuxuan/Desktop/Lenovo/agent-gate/src/gateway/gateway.ts)
- [src/orchestrator/orchestrator.ts](/Users/liuyuxuan/Desktop/Lenovo/agent-gate/src/orchestrator/orchestrator.ts)
- [src/store/memory-store.ts](/Users/liuyuxuan/Desktop/Lenovo/agent-gate/src/store/memory-store.ts)
- [src/types/index.ts](/Users/liuyuxuan/Desktop/Lenovo/agent-gate/src/types/index.ts)

当前是内存态 MVP，已具备：

- `run_start`
- `taskcard_get`
- `taskcard_put`
- `handoff_get`
- `handoff_put`
- `budget_check`
- `policy_check`
- `audit_append`
- `verify_run`
- `approval_request`
- `feedback_gate`

同时暴露 4 个 prompts：

- `agentgate_start_run`
- `agentgate_resume_run`
- `agentgate_verify_run`
- `agentgate_prepare_handoff`

以及 4 个 resources：

- `taskcard://{runId}`
- `handoff://{runId}`
- `runlog://{runId}`
- `policy://current`

## 开发者使用

完整流程文档在这里：

- [Developer Guide](/Users/liuyuxuan/Desktop/Lenovo/agent-gate/docs/agent-gate/developer-guide.md)

覆盖内容包括：

- 本地开发与调试
- npm 发布前检查与发布命令
- npm 安装方式
- VS Code 通过 `.vscode/mcp.json` 接入
- VS Code / Copilot Chat 中如何调用 tools、prompts、resources

## 目录

```text
src/
├─ index.ts
├─ gateway/
├─ orchestrator/
├─ store/
├─ types/
├─ budget/
├─ policy/
├─ audit/
├─ config/
└─ interaction/

.github/
├─ copilot-instructions.md
├─ instructions/
├─ agents/
├─ prompts/
└─ hooks/

scripts/
docs/agent-gate/
```

## 开发

安装依赖：

```bash
npm install
```

类型检查：

```bash
npm run typecheck
```

构建：

```bash
npm run build
```

运行一个本地 smoke test：

```bash
npm run smoke
```

直接启动 stdio MCP server：

```bash
npm start
```

## VS Code 配置

仓库内已经提供本地 MCP 配置文件 [.vscode/mcp.json](/Users/liuyuxuan/Desktop/Lenovo/agent-gate/.vscode/mcp.json)：

```json
{
  "servers": {
    "agent-gate": {
      "type": "stdio",
      "command": "node",
      "args": ["dist/index.js"]
    }
  }
}
```

`.github` 下的 customizations 目前也已经收口到新结构：

- instructions: 全局与模块规则
- agents: gate / planner / implementer / reviewer
- prompts: start / resume / verify / handoff
- hooks: approval / post-verify / stop-gate / audit

## 当前未完成项

- hooks 脚本还是 placeholder，没有接真实 run store
- control plane 还没有独立服务化
- state 还没有持久化恢复
- verify 逻辑目前是最小可运行版，不是最终规则集
- GitHub 仓库名与包名还未完全统一
