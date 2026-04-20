# packages/cli 开发规则

本文件定义 `packages/cli` 的开发边界、职责约束和架构问题。

## 核心定位

`packages/cli` 是 AgentILS 的 **项目外配置注入工具**，面向开发者提供一条命令完成 IDE 配置：

```bash
npx agentils init --vscode
npx agentils init --cursor
```

## ⚠️ 关键架构区分：两套完全独立的配置系统

AgentILS 有两套**完全独立**的配置分发系统，职责不同、面向人群不同、内容不同。**禁止混淆。**

### 1. 开发指引同步（`.hc/instructions/` + sync 脚本）

| 项目 | 说明 |
|------|------|
| **工具** | `scripts/sync-agent-instructions.mjs` + `.hc/instructions/sync-manifest.json` |
| **面向** | AgentILS 项目本身的开发者 |
| **内容** | 模块边界、调用链、状态真值源、开发规范 |
| **方向** | `.hc/instructions/` → `.github/`、`AGENTS.md` |
| **触发** | `pnpm run sync:instructions` 或 `pre-commit` hook |
| **用途** | 让 Copilot/Codex 在开发 AgentILS 时读取开发指引 |

### 2. 用户配置注入（`packages/cli`）

| 项目 | 说明 |
|------|------|
| **工具** | `agentils inject [ide]` 命令 |
| **面向** | 使用 AgentILS 的外部开发者 |
| **内容** | MCP server 配置 + 行为约束模板（教 LLM 怎么用 AgentILS tools） |
| **方向** | `packages/cli/templates/` → IDE 特定配置目录 |
| **触发** | 开发者 `npx agentils init --[ide]` 执行一次 |
| **用途** | 让 IDE 正确连接和使用 AgentILS MCP server |

### 禁止混淆的具体规则

- **CLI 禁止读取 `.hc/instructions/` 下的任何文件** — 那是开发指引，不是用户模板
- **CLI 禁止调用 `syncGeneratedInstructions()`** — 那是 sync 脚本的职责
- **CLI 的模板必须存放在 `packages/cli/templates/`** — 不从 `extensions/agentils-vscode/templates/` 或其他包读取
- **模板内容是行为约束（怎么用 AgentILS tools），不是开发指引（模块边界、调用链）**

## CLI 模板目录结构

```
packages/cli/
  templates/
    vscode/
      copilot-instructions.md    → inject 到用户 Copilot prompts 目录
      agentils.orchestrator.agent.md
      agentils.run-code.prompt.md
      ...
    cursor/
      agentils.mdc               → inject 到 .cursor/rules/
    codex/
      (config.toml 内容由代码生成)
    antigravity/
      agentils.md                → inject 到 .agent/rules/
      (workflows 由代码生成)
```

### 模板内容应该包含什么

模板面向的是**使用 AgentILS 的开发者**（外部用户），内容应该是：

- MCP tools 的使用约束（调用顺序、不能自作主张完成任务等）
- AgentILS 工作流阶段说明（collect → plan → approval → execute → verify → done）
- IDE 特定的交互规则（如 VS Code 中使用 WebView、Cursor 中遵循 rules）

模板**不应该**包含：
- 模块边界和调用链（这是开发指引）
- 状态真值源和 store 架构（这是开发指引）
- 内部 API 细节（`ctx.elicitUser()`、`memory-store.ts` 等）

## 与 `humanClarification.hcInstall.installFromTemplate` 的关系

CLI 的 inject 和 HC 扩展的 `installFromTemplate` 做同一件事：将模板写入 IDE 配置目录 + 写入 MCP server 配置。区别：`installFromTemplate` 通过 VS Code 扩展命令触发（仅限 VS Code），CLI 通过命令行触发（跨 IDE）。

## 为什么 IDE 原生能力不能完全替代 CLI

各 IDE 已有原生配置机制（VS Code Agent Plugins、Cursor Remote Rules 等），但 CLI 仍有 DX 价值：
- 开发者不需要了解每个 IDE 的配置细节，一条命令搞定
- 相同的模板内容，CLI 转换为不同 IDE 格式
- CI/CD 或 onboarding 脚本中可直接调用

## 当前支持的 IDE 目标

| 目标 | 注入内容 | 命令 |
|------|----------|------|
| `vscode` | VS Code user prompts/agents、`.vscode/mcp.json` | `agentils inject vscode` |
| `cursor` | `.cursor/rules/agentils.mdc`、`.cursor/mcp.json` | `agentils inject cursor` |
| `codex` | `AGENTS.md`、`~/.codex/config.toml` | `agentils inject codex` |
| `antigravity` | `.agent/rules/agentils.md`、`.agent/workflows/` | `agentils inject antigravity` |

## 禁止事项

- 禁止包含任何业务逻辑（task management、approval、budget 等属于 `packages/mcp`）
- 禁止包含任何 IDE 特定的 UI 代码（属于对应的 IDE 扩展包）
- 禁止在运行时读取 monorepo 源码树文件（模板必须在 CLI 包内）
- 禁止混淆开发指引和用户模板

## ⚠️ 当前架构 bug

### 问题 1：运行时依赖 monorepo 源码树

```typescript
const sourceRoot = resolve(packageRoot, '../..')  // 指向 monorepo 根

// 以下路径在 npm 发布后不存在：
readNormalized(join(sourceRoot, '.hc', 'instructions', 'agentils.instructions.md'))
readNormalized(join(sourceRoot, 'extensions', 'agentils-vscode', 'templates', fileName))
```

**修复**：模板迁移到 `packages/cli/templates/`，构建时嵌入或打包到 `dist/`。

### 问题 2：注入了开发指引而非用户模板

当前 `injectCursor()` 和 `injectAntigravity()` 读取 `agentils.instructions.md`（开发指引）写入用户项目的 rules 文件。这是**错的** —— 外部用户不需要知道 AgentILS 的模块边界和状态真值源。

**修复**：为 Cursor/Antigravity 创建面向用户的行为约束模板。

### 问题 3：VS Code inject 混入了 sync 职责

`injectVsCode()` 调用了 `syncGeneratedInstructions()`，这是 sync 脚本的职责，不应在 CLI inject 中。

**修复**：移除 `syncGeneratedInstructions()` 调用，VS Code inject 只负责写入 MCP config + 用户 prompt 模板。

### 安全参考

参照 `humanClarification.hcInstall.installFromTemplate` 的五层安全校验：路径穿越检查、命名空间校验、扩展名白名单、文件大小限制、数组合并策略。

## 开发工作流

1. 修改 CLI 模板：编辑 `packages/cli/templates/` 下的文件
2. 修改开发指引：编辑 `.hc/instructions/`，运行 `pnpm run sync:instructions`
3. 构建 CLI：`pnpm run build`
4. 测试注入：`pnpm --filter @agentils/cli run dev inject vscode --dry-run`
