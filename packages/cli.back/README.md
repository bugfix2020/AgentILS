# @agent-ils/cli — VS Code 配置注入工具

> **角色**：把 AgentILS 的 MCP server 配置 + 用户行为约束 prompt 写入工作区 `.vscode/` 和 `.github/`。
> **当前能力**：**仅支持 VS Code**（cursor / codex / antigravity 在 V1 不在范围内）。

## 一句话

```bash
npx agentils install vscode             # 写入当前 cwd 工作区
npx agentils install vscode --workspace /path/to/repo
npx agentils install vscode --dry-run
npx agentils uninstall vscode
```

## 命令

| Command                     | 作用                                                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agentils install vscode`   | 写入 `.vscode/mcp.json`（HTTP，默认 `http://127.0.0.1:8788/mcp`，可由 `AGENTILS_HTTP_PORT` / `AGENTILS_HTTP_HOST` 覆盖）+ `.github/agents/agentils.loop.agent.md` + `.github/prompts/runtask.prompt.md` |
| `agentils uninstall vscode` | 移除上述写入文件 + 清理已知历史路径（`runTask.prompt.md` 大写、旧 `agentils.orchestrator.agent.md` 等）                                                                                                 |
| `agentils --help` / 无参    | 打印帮助                                                                                                                                                                                                |

参数：

| Flag                            | 默认            | 说明                           |
| ------------------------------- | --------------- | ------------------------------ |
| `--workspace <path>`            | `process.cwd()` | 目标工作区根                   |
| `--scope workspace\|user\|both` | `workspace`     | 仅工作区 / 仅用户级 / 同时写入 |
| `--dry-run`                     | false           | 预演不落盘                     |

## 模板

模板**只在** `packages/cli/templates/vscode/` 下，绝不读 `docs/instructions/` 或其它包：

```
packages/cli/templates/vscode/
  agents/
    agentils.loop.agent.md       → .github/agents/agentils.loop.agent.md
  prompts/
    runTask.prompt.md            → .github/prompts/runtask.prompt.md（小写规范化）
```

模板内容是**用户行为约束**：教 LLM 怎么调 `mcp_agentils_state_get` + `mcp_agentils_run_task_loop`，**不是开发指引**（模块边界、调用链等只属于 `docs/instructions/`）。

## 两套配置系统的硬边界（禁止混淆）

| 系统                       | 工具                                                                               | 内容                              | 面向                       | 方向                                                       |
| -------------------------- | ---------------------------------------------------------------------------------- | --------------------------------- | -------------------------- | ---------------------------------------------------------- |
| **开发指引同步**           | `scripts/dev/sync-agent-instructions.mjs` + `docs/instructions/sync-manifest.json` | 模块边界、调用链、状态真值源      | AgentILS 项目自身开发者    | `docs/instructions/` → `.github/` + `AGENTS.md`            |
| **用户配置注入（本 CLI）** | `agentils install vscode`                                                          | MCP server 配置 + 行为约束 prompt | 使用 AgentILS 的外部开发者 | `packages/cli/templates/` → 工作区 `.vscode/` + `.github/` |

**绝对禁止**：

- CLI 读取 `docs/instructions/` 任何文件
- CLI 调 `syncGeneratedInstructions()`
- CLI 模板存放到非 `packages/cli/templates/` 之外
- CLI 内嵌业务逻辑（任何 task / approval / budget 都属于 `packages/mcp`）

## 生成的 `.vscode/mcp.json` 示例

```jsonc
{
    "servers": {
        "agentils": {
            "type": "http",
            "url": "http://127.0.0.1:8788/mcp",
        },
    },
}
```

> 如果工作区已经安装并启动了 `agentils-vscode` 扩展，扩展会在 `openPanel` 时把这里的 url 改写为 MCP server 实际绑定的端口（lock 文件中的 url），防止 8788 被占时配置漂移。

## 验证命令

```bash
cd packages/cli
pnpm tsc -p . --noEmit
pnpm tsup
pnpm test                                # 5 个用例，含 mcp.json HTTP transport 模板断言
node dist/index.js --help                # 不应抛错
node dist/index.js install vscode --workspace /tmp/demo --dry-run
```

全部通过 = CLI 就绪。

## 当前不在范围内

- Cursor / Codex / Antigravity / 其它 IDE 注入器（V1 暂不实现）
- 注入业务逻辑或开发指引（永久禁止）
- 编辑 `docs/instructions/`（属于 sync 脚本）
