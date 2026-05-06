# AgentILS 通用开发规则

> **⚠️ 本文件是开发指引**，面向 AgentILS 项目本身的开发者。
> 通过 `sync-manifest.json` 同步到 `.github/instructions/agentils.instructions.md` + `AGENTS.md`，供 Copilot/Codex 在开发 AgentILS 时读取。
> **本文件不应被 `packages/cli` 读取或注入到外部用户项目。** CLI 有自己独立的模板体系（`packages/cli/templates/`），内容是面向用户的行为约束。

## 仓库结构（Plan C / V1）

| 包               | 路径                         | 角色                                                                       |
| ---------------- | ---------------------------- | -------------------------------------------------------------------------- |
| **MCP 控制平面** | `packages/mcp`               | 单一 HTTP MCP server（默认 `http://127.0.0.1:8788/mcp`），唯一状态机真值源 |
| **VS Code 扩展** | `extensions/agentils-vscode` | thin bridge：HTTP MCP client + WebView，**不**承载业务逻辑                 |
| **CLI 配置工具** | `packages/cli`               | 仅 VS Code 配置注入器（`install vscode` / `uninstall vscode`）             |

## 核心原则

### 单一真值源 + Plan C 单 server

- 每个工作区**只能有一个运行中的 MCP HTTP server**，由 `~/.agentils/runtime-{sha1(workspace).slice(0,12)}.lock` 协调。
- Copilot（通过 `.vscode/mcp.json`）和扩展（通过 `runtime-client`）连接**同一个** server，看到**同一份**状态。
- 扩展在 `openPanel` 时调用 `runtimeClient.getCurrentLock()` 同步 `.vscode/mcp.json` 的 url，防止 8788 被占时配置漂移。

### 三层职责边界

- **packages/mcp** 管理所有状态和业务逻辑（V1 task loop：`collect → plan → execute → test → summarize`，控制模式 `normal/alternate/direct`，directive、interaction、override 全部在此）。
- **extensions/agentils-vscode** 只做 UI 渲染、订阅 `state://` resources、转发 elicitation 与用户交互；**禁止**实现业务规则。
- **packages/cli** 只做配置注入；**禁止**包含运行时业务、**禁止**读 `docs/instructions/`。

修改代码前确认变更属于哪个包；跨边界修改应被阻止。

### 单向数据流

```
Gateway (输入) → Orchestrator (逻辑) → memory-store (真值源)
                                        ↓
                            投影 (state:// resources, view-model)
                                        ↓
                            HTTP push (ResourceNotifier per client)
```

命令可以从多个入口进入；派生状态只有一个真值源；禁止在多个模块重复计算核心状态。

### V1 暴露契约（外部唯一可信契约）

- **MCP tools**（`packages/mcp/src/gateway/tools.ts`）：`state_get`、`request_user_clarification`、`run_task_loop`。**不要**在文档/模板/客户端假设其它 tool 还存在。
- **MCP resources**（`packages/mcp/src/gateway/resources.ts`）：`state://current`、`state://{taskId}`、`state://controlMode/{taskId}`、`state://timeline/{taskId}`、`state://interaction/pending`。
- **CLI 命令**（`packages/cli/src/index.ts`）：`install vscode` / `uninstall vscode` / `--help`，仅 vscode。

### 持久化现状

`memory-store.ts` 是**纯内存**真值源，进程退出即丢。`store/persistence/json-store.ts` 已实现 load/save，但**当前 0 引用**。任何持久化需求需明确接入计划，禁止在文档中暗示"已持久化"。

## 交互协议

- MCP 通过 `ctx.elicitUser()`（即 `server.server.elicitInput`）发起用户交互，超时 `2_147_483_647ms`。
- MCP 不关心客户端 UI 形态。当前已实现的承接者只有 `extensions/agentils-vscode`。
- 无承接者时，elicitation 请求会挂起或失败 —— 这是"链路断裂"，不是"UI 简化"。

## 开发规范

- 读取顺序：先 `AGENTS.md`，再 `docs/instructions/impl-debug.instructions.md`，然后按问题分类查阅模块。
- 不要一开始就全仓扫描；从当前调用链和模块边界出发。
- 先分类问题主链路：`task loop step` / `state read` / `state push` / `clarification` / `HTTP transport` / `VS Code activation` / `CLI inject`。
- 优先采用测试先行；先定义 I/O 合同与 schema，再实现。
- 修改前对齐上下游 I/O 合同；优先信类型，不靠运行时猜测。
- 用 MCP resources 暴露状态可见性，而非藏在 prompt state 里。
- 区分 task completion（任务终态）和 conversation completion（对话结束）；新任务入口必须显式。

## Gateway 边界规则

- Gateway 只做：解析输入 → 创建 request context → `ctx.elicitUser()` → 委托 orchestrator → `textResult()` 返回。
- **禁止** Gateway 直接执行域写入（task 状态转移、override 更新、controlMode 转换都属于 orchestrator）。

## ResourceNotifier 模式（重要）

每个 HTTP client 连接独立注册 notifier；orchestrator 用 `Set<ResourceNotifier>`：

```ts
const registration = orchestrator.addNotifier(runtime.notifier)
runtime.disposeNotifier = registration.dispose
// transport.onclose → runtime.disposeNotifier()
// 广播：orchestrator.fanout(n => n.notifyTask(taskId))
```

`setNotifier()` 仅向后兼容；新代码用 `addNotifier()`。

## 执行法则（Control Modes，航空 ILS 致敬）

| 法则     | 值            | 特征                                       |
| -------- | ------------- | ------------------------------------------ |
| 正常法则 | `'normal'`    | 标准收敛链路                               |
| 备用法则 | `'alternate'` | 用户确认后执行（提高控制权）               |
| 直接法则 | `'direct'`    | 最少干预，用户掌控方向（审计可见性不减少） |

## V1 任务阶段

`collect → plan → execute → test → summarize`；终态：`active | completed | failed | abandoned`。

不得在 verification 与 summary 状态对齐前标记任务完成。
高风险操作需通过 elicitation 显式确认或 user override。

## 命名约定

- 项目名固定 **AgentILS**（不写成 Agentils / agentils 等变体）。
- npm 包名：`@agent-ils/mcp`、`@agent-ils/cli`；扩展 publisher：`bugfix2020`。
- HTTP MCP 端点：默认 `http://127.0.0.1:8788/mcp`，可通过 `AGENTILS_HTTP_PORT` / `AGENTILS_HTTP_HOST` 覆盖。

## 分支与 PR 流（Branch Flow，**强约束**）

> 这条规则的违反代价极高，任何 agent 在开 PR 前**必须**确认 base 分支。

本仓库采用 **GitHub Flow**（不使用 staging 分支）：

- **`main`** 是唯一长期分支，也是 npm/README 的发布源。
- 所有 feature / fix / chore / docs 分支都从 `main` 切出，PR 也**只能**回到 `main`。
- **不**使用 `dev` / `develop` / `staging` 等中间分支；如果需要分阶段发布或灰度，临时拉 `release/v0.x` 分支挑 commit 即可，不要常驻。
- 任何工具自动开 PR 时（如 `mcp_gitkraken_pull_request_create`），`target_branch` **默认且必须是 `main`**。
- 推荐工作流：

    ```
    git checkout main && git pull --ff-only      # 总是从最新 main 出发
    git checkout -b <type>/<short-kebab>         # 遵守 branch-name-standard skill
    # ...编码 + commit...
    pnpm changeset                                # 改动了 packages/* → 生成一个 .changeset/<name>.md
    git add .changeset && git commit -m "chore(changeset): <pkg> <bump>"
    git push -u origin <branch>                  # 开 PR target = main
    ```

- 历史背景：早期试过 `feat → dev → main` 的线性流，结果：(a) PR 合并时 dev 上的修改没同步进 main，导致后续 push 丢失；(b) 单人/双人开发下 dev 没有真实 staging 验证场景，只是制造同步负担。已统一收敛到 GitHub Flow。

## 发布前 Changelog 同步（**强约束**）

**Changelog 由 release 流程驱动，不在 push 时生成。** 这是 monorepo 多 npm 包独立发版的正确边界。

- 每个 npm 包（`@agent-ils/mcp` / `cli` / `quality-gate` / `logger`）应该有自己的 `packages/<name>/CHANGELOG.md`，记录该包的版本变更。**不要**在仓库根目录维护一个聚合 CHANGELOG。
- 工具：[`@changesets/cli`](https://github.com/changesets/changesets) 已在仓库落地，配置见 [`.changeset/config.json`](.changeset/config.json)（`baseBranch: main`、`access: public`、`fixed: []`）。
- 工作流：
    - 每个改动了 `packages/*`（不含 `packages/extensions/*`）的 PR 必须配套运行 `pnpm changeset`，按交互提示选择受影响的包和 bump 类型（patch / minor / major），生成 `.changeset/<name>.md` 并随 PR 提交。**CI 会强制检查**（[`.github/workflows/ci.yml`](.github/workflows/ci.yml)），缺失则 PR 红灯。
    - 纯文档 / `apps/*` / `packages/extensions/*` / `scripts/*` / `.changeset/` 配置本身的改动可豁免（CI 自动跳过检查）。
    - Release **完全自动化**，不需要手动跑命令：
        - PR 合并到 `main` 后，[`.github/workflows/release.yml`](.github/workflows/release.yml) 触发 [`changesets/action`](https://github.com/changesets/action)：
            - 如果 `.changeset/*.md` 存在 → 自动开（或更新）一个 `chore(release): version packages` PR，PR 内容是 `pnpm changeset version` 的产物（bump version + 写 per-package CHANGELOG）。
            - 当那个 Version PR 被 merge 后（`.changeset/*.md` 全部消费完）→ action 自动跑 `pnpm changeset publish`：发布到 npm + 打 git tag + 推送。
        - 维护者**只需 review 并 merge Version PR**，不要在本地跑 `pnpm changeset version` / `publish`。
    - 前置条件：`NPM_TOKEN`（npm Automation token）必须配置在 GitHub repo Secrets。
- **不要**在 pre-commit / pre-push 阶段跑 changelog 生成（这会污染 commit 范畴、产生噪音 chore 提交、模糊"已发布"语义）。仓库根的 `.husky/pre-push` 和 `package.json` 里曾经的 `changelog` / `generate:changelog*` 脚本均已废弃删除，不要复活。

## CI（**强约束**）

GitHub Actions 工作流位于 [`.github/workflows/`](.github/workflows/)：

- **`ci.yml`** — PR 与 `main` push 触发：install / typecheck / lint / build / test / `sync:instructions:check` / changeset 检查。所有 PR 必须全绿才能合并。
- **`release.yml`** — `main` push 触发：跑 `changesets/action`，自动管理 Version PR + npm publish + git tag。详见上方 changelog 章节。

不要绕过 CI 直接 push 到 `main`（GitHub Flow 已经强制 PR 流程）。本地的 husky hook 是辅助防线，不是真值源 —— CI 才是。
