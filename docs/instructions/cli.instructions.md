# packages/cli 开发规则

定义 `packages/cli`（VS Code 配置注入器）的边界、职责约束、当前能力范围。

## 核心定位

`packages/cli` 是 AgentILS 的**项目外配置注入工具**，仅面向开发者一条命令完成 VS Code 配置：

```bash
npx agentils install vscode             # 写入 .vscode/mcp.json + .github/{agents,prompts}/
npx agentils install vscode --workspace /path/to/repo
npx agentils install vscode --dry-run
npx agentils uninstall vscode
```

**当前 V1 仅支持 VS Code**。Cursor / Codex / Antigravity / 其它 IDE 不在 V1 范围内 —— 任何文档/帮助/模板**不应**暗示它们已支持。

## ⚠️ 两套完全独立的配置系统（禁止混淆）

| 系统 | 工具 | 内容 | 面向 | 方向 |
|------|------|------|------|------|
| **开发指引同步** | `scripts/dev/sync-agent-instructions.mjs` + `docs/instructions/sync-manifest.json` | 模块边界、调用链、状态真值源、开发规范 | AgentILS 项目自身开发者 | `docs/instructions/` → `.github/` + `AGENTS.md` |
| **用户配置注入（本 CLI）** | `agentils install vscode` | MCP server 配置 + 行为约束 prompt | 使用 AgentILS 的外部开发者 | `packages/cli/templates/` → `.vscode/mcp.json` + `.github/{agents,prompts}/` |

### 绝对禁止

- CLI 读取 `docs/instructions/` 任何文件 —— 那是开发指引
- CLI 调 `syncGeneratedInstructions()` —— 那是 sync 脚本职责
- CLI 模板存放在非 `packages/cli/templates/` 之外
- 模板内容包含模块边界 / 调用链 / 内部 API 细节（属于开发指引）

## 当前命令

| Command | 行为 |
|---------|------|
| `agentils install vscode` | 写 `.vscode/mcp.json`（HTTP，默认 `http://127.0.0.1:8788/mcp`，可由 `AGENTILS_HTTP_PORT`/`AGENTILS_HTTP_HOST` 覆盖）+ `.github/agents/agentils.loop.agent.md` + `.github/prompts/runtask.prompt.md` |
| `agentils uninstall vscode` | 移除上述文件 + 清理 legacy 路径（`runTask.prompt.md` 大写、旧 `.copilot/` 目录、旧 `agentils.orchestrator.agent.md` 等） |
| `agentils --help` / `-h` / 无参 | 打印帮助 |

参数：

| Flag | 默认 | 说明 |
|------|------|------|
| `--workspace <path>` | `process.cwd()` | 目标工作区根 |
| `--scope workspace\|user\|both` | `workspace` | 仅工作区 / 仅用户级 / 同时写入 |
| `--dry-run` | false | 预演不落盘 |

## 模板目录

模板**只在** `packages/cli/templates/vscode/`：

```
packages/cli/templates/vscode/
  agents/
    agentils.loop.agent.md       → .github/agents/agentils.loop.agent.md
  prompts/
    runTask.prompt.md            → .github/prompts/runtask.prompt.md（小写规范化）
```

模板内的 tool 引用必须是 V1 规范名：`mcp_agentils_state_get` / `mcp_agentils_run_task_loop`（旧名 `bugfix2020.agentils-vscode/stateGet` 等已废弃）。

### 模板内容应该包含

- MCP tools 的使用约束（调用顺序、不能自作主张完成任务等）
- AgentILS V1 工作流阶段说明（`collect → plan → execute → test → summarize`）
- VS Code 特定的交互规则（@agentils 入口、WebView 形态）

### 模板**不应该**包含

- 模块边界与调用链（开发指引）
- 状态真值源、store 架构（开发指引）
- 内部 API 细节（`ctx.elicitUser()`、`memory-store.ts` 等）

## 生成的 `.vscode/mcp.json`

```jsonc
{
  "servers": {
    "agentils": {
      "type": "http",
      "url": "http://127.0.0.1:8788/mcp"
    }
  }
}
```

如果工作区已安装 `agentils-vscode` 扩展，扩展会在 `openPanel` 时根据 `~/.agentils/runtime-*.lock` 把 url 改写为 MCP server 实际绑定的端口。CLI 写入的是**默认值**；运行时真值由扩展同步。

## 安全参考

参照 `humanClarification.hcInstall.installFromTemplate` 的五层安全校验：路径穿越检查、命名空间校验、扩展名白名单、文件大小限制、数组合并策略。

## 验证命令

```bash
cd packages/cli
pnpm tsc -p . --noEmit
pnpm tsup
pnpm test                       # 5 用例，含 mcp.json HTTP transport 模板断言
node dist/index.js --help
node dist/index.js install vscode --workspace /tmp/demo --dry-run
grep -n 'type:' dist/index.js   # 应只看到 "http"，不应有 "stdio"
```

全部通过 = CLI 就绪。

## 禁止事项（再次强调）

- 包含任何业务逻辑（task / approval / budget / policy 全部属于 `packages/mcp`）
- 包含任何 IDE 特定 UI 代码（属于对应扩展）
- 在运行时读取 monorepo 源码树文件（模板必须在 CLI 包内并通过 tsup 构建嵌入）
- 混淆开发指引与用户模板
- 在文档中暗示已支持 cursor / codex / antigravity（V1 仅 vscode）

## 开发工作流

1. 修改 CLI 模板：编辑 `packages/cli/templates/vscode/` 下文件
2. 修改开发指引：编辑 `docs/instructions/`，运行 `node scripts/dev/sync-agent-instructions.mjs`
3. 构建 CLI：`pnpm -C packages/cli tsup`
4. 测试注入：`node packages/cli/dist/index.js install vscode --workspace /tmp/demo --dry-run`
