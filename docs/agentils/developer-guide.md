# AgentILS Developer Guide

本文档面向开发人员，覆盖从本地开发、发布、安装，到 VS Code 中接入和调用 AgentILS 的完整流程。

## 0. GitHub 仓库现状

当前公开仓库地址：

- [bugfix2020/AgentILS](https://github.com/bugfix2020/AgentILS)

当前存在一处命名分层：

- GitHub 仓库名是 `AgentILS`
- 本地 runtime 对外展示名使用 `AgentILS`
- npm 包和 CLI 使用 `agentils`

这意味着当前最稳妥的策略是：

- 仓库层面继续沿用 `AgentILS`
- 运行时入口和 CLI 名使用 `agentils`
- MCP server 展示名使用 `AgentILS`

如果未来要统一名字，建议作为单独迁移处理，不要和当前功能开发混在一起。

## 1. 先说明边界

当前仓库交付的是一个 `MCP server`，不是一个 `VS Code extension` 仓库。

这意味着：

- 你当前发布的是一个 Node 包
- VS Code 通过 MCP 配置启动这个包
- 不需要先做 `.vsix` 扩展才能使用

如果未来要做 VS Code 插件，推荐把插件仓库作为单独项目，只负责：

- 安装和发现 MCP server
- 提供 UI / Webview / 安装向导
- 管理 `.vscode/mcp.json` 或用户级 MCP 配置

而这个仓库继续只负责 MCP runtime 本身。

## 2. 本地开发流程

### 2.1 环境要求

- Node.js 20+
- npm 10+
- VS Code 新版，且已启用 MCP 能力

### 2.2 安装依赖

```bash
npm install
```

### 2.3 本地检查

```bash
npm run typecheck
npm run build
npm run smoke
```

说明：

- `typecheck`：类型检查
- `build`：生成 `dist/`
- `smoke`：直接导入构建产物并创建 MCP runtime，确认基础初始化没有坏

### 2.4 本地启动

```bash
npm start
```

这会以 `stdio` 模式启动 MCP server，供 VS Code 或其他 MCP client 进程拉起。

### 2.5 本地 HTTP stream 调试

如果你只是想在本地直接测试，不想先走发布链路，可以直接启动 Streamable HTTP：

```bash
npm install
npm run dev:http
```

默认监听：

```text
http://127.0.0.1:8788/mcp
```

健康检查：

```text
http://127.0.0.1:8788/health
```

构建产物模式：

```bash
npm run build
npm run start:http
```

## 3. 发布流程

### 3.1 发布前检查

仓库已经配置：

- `bin.agentils -> dist/index.js`
- `prepublishOnly -> npm run typecheck && npm run build`

所以执行 `npm publish` 前会自动做最基本的发布校验。

### 3.2 本地打包预检

建议先跑：

```bash
npm pack
```

检查 tarball 内是否只包含预期内容，至少应包含：

- `dist/**`
- `README.md`

### 3.3 发布到 npm

```bash
npm login
npm publish --access public
```

如果未来准备把发布名也统一到 `AgentILS` 语义下，再决定是否迁移到：

- `agentils`
- `@bugfix2020/agentils`
- `@bugfix2020/agentils`

如果是 scoped package，例如 `@your-org/agentils`：

```bash
npm publish --access public
```

如果是私有包，则按你的 npm registry 策略发布。

## 4. 安装流程

当前推荐两种安装方式。

### 4.1 方式 A：直接从源码仓库使用

适合本地开发和调试：

```bash
git clone <repo>
cd AgentILS
npm install
npm run build
```

然后在 VS Code MCP 配置里直接指向：

```json
{
  "servers": {
    "agentils": {
      "type": "stdio",
      "command": "node",
      "args": ["dist/index.js"]
    }
  }
}
```

### 4.2 方式 B：通过 npm 安装

适合团队或终端用户使用。

全局安装：

```bash
npm install -g agentils
```

或用 `npx` 直接运行：

```bash
npx -y agentils
```

发布为 scoped package 时示例：

```bash
npx -y @your-org/agentils
```

## 5. VS Code 接入流程

### 5.1 工作区接入

在工作区的 `.vscode/mcp.json` 中配置 server。

#### 本地源码模式

```json
{
  "servers": {
    "agentils": {
      "type": "stdio",
      "command": "node",
      "args": ["dist/index.js"]
    }
  }
}
```

#### npm / npx 模式

```json
{
  "servers": {
    "agentils": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "agentils"]
    }
  }
}
```

#### 本地 HTTP stream 模式

如果你的测试客户端支持 Streamable HTTP，也可以直接连：

```text
http://127.0.0.1:8788/mcp
```

这条路径主要用于本地调试，不替代 VS Code 的 stdio 接入方式。

如果是 scoped 包：

```json
{
  "servers": {
    "agentils": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@your-org/agentils"]
    }
  }
}
```

### 5.2 允许采样

当前仓库提供了一个工作区设置示例 [settings.json](/Users/liuyuxuan/Desktop/Lenovo/agent-gate/.vscode/settings.json)：

```json
{
  "chat.mcp.serverSampling": {
        "agent-gate/.vscode/mcp.json: agentils": {
      "allowedDuringChat": true
    }
  }
}
```

如果你的客户端需要 MCP sampling，这个设置可以作为参考。

### 5.3 验证 VS Code 发现成功

接入成功后，你应该能在 VS Code 的 MCP server 列表里看到 `AgentILS`，并在 chat 中看到它暴露的：

- tools
- prompts
- resources

## 6. 在 VS Code / Copilot Chat 中如何调用

### 6.1 Tools

当前 server 注册的 tools 在 [gateway.ts](/Users/liuyuxuan/Desktop/Lenovo/agent-gate/src/gateway/gateway.ts) 中。

你可以直接让 agent 调用，或者在对话里显式描述目标。

示例：

```text
Start a new run for implementing a stop gate for risky tools.
```

预期会先走：

- `run_start`

再由 agent 根据需要调用：

- `run_get`
- `taskcard_get`
- `taskcard_put`
- `budget_check`
- `policy_check`
- `verify_run`

### 6.2 人工确认

涉及显式确认时可以走：

- `approval_request`
- `feedback_gate`

它们当前使用 MCP elicitation 表单收集用户输入，并把审批/反馈结果写回共享 state。

### 6.3 Prompts

当前有 4 个 prompts：

- `agentgate_start_run`
- `agentgate_resume_run`
- `agentgate_verify_run`
- `agentgate_prepare_handoff`

这些 prompts 适合做固定入口，例如：

- 新建 run
- 恢复 run
- 校验 run
- 生成 handoff

### 6.4 Resources

当前有 4 个 resources：

- `taskcard://{runId}`
- `handoff://{runId}`
- `runlog://{runId}`
- `policy://current`

适合场景：

- 把结构化状态附加给 chat
- 让用户直接查看当前 run 态势
- 恢复上一个 run

## 7. 给“VS Code 插件安装/发布”的正确说法

如果你一定要面向团队写“插件安装流程”，建议明确分开两层：

### 7.1 当前可交付物

当前可交付物是：

- npm package
- MCP server
- VS Code MCP config
- GitHub 仓库：[bugfix2020/AgentILS](https://github.com/bugfix2020/AgentILS)

不是：

- Marketplace VSIX extension

### 7.2 如果未来要做 VS Code 插件

建议插件只做这些事：

- 安装或更新 npm 包
- 写入 MCP 配置
- 提供连接状态页
- 暴露 richer setup UI

而不要把核心状态机复制进扩展侧。

## 8. 推荐的完整交付路径

对开发团队，当前最实用的完整流程是：

1. 在本仓库开发并验证 MCP server
2. `npm publish`
3. 使用 `npx -y agentils` 或全局安装方式分发
4. 在项目或用户级 `.vscode/mcp.json` 中接入
5. 在 VS Code Chat 中调用 tools/prompts/resources
6. 后续再单独做一个薄的 VS Code extension 作为安装壳
