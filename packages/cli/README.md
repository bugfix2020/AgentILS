# @agentils/cli — 跨 IDE 配置注入工具

一条命令完成 AgentILS 的 IDE 配置：

```bash
npx agentils init --vscode
npx agentils init --cursor
```

## 定位

`@agentils/cli` 将 MCP server 配置和行为约束模板注入到不同 IDE 各自的标准位置。

**核心价值**：
- **DX 便捷**：开发者不需要了解每个 IDE 的配置细节
- **统一入口**：相同的模板内容，CLI 转换为不同 IDE 格式
- **可复现**：CI/CD 或 onboarding 脚本中可直接调用

## 支持的 IDE

| IDE | 命令 | 注入内容 |
|-----|------|----------|
| VS Code | `agentils inject vscode` | user prompts/agents、`.vscode/mcp.json` |
| Cursor | `agentils inject cursor` | `.cursor/rules/agentils.mdc`、`.cursor/mcp.json` |
| Codex | `agentils inject codex` | `AGENTS.md`、`~/.codex/config.toml` |
| Antigravity | `agentils inject antigravity` | `.agent/rules/`、`.agent/workflows/` |

## 使用方式

```bash
# 注入到 VS Code（默认）
agentils inject

# 指定工作区路径
agentils inject --workspace /path/to/workspace

# 指定目标 IDE
agentils inject --ide cursor --workspace /path/to/workspace

# 卸载配置
agentils uninstall --ide vs-code
```

## 依赖关系

```
@agentils/cli
    → 注入 MCP server 配置 + 行为约束模板
    → IDE 通过配置连接 @agentils/mcp
```
