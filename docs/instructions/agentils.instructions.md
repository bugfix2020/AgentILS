# AgentILS 通用开发规则

> **⚠️ 本文件是开发指引**，面向 AgentILS 项目本身的开发者。
> 通过 `sync-manifest.json` 同步到 `.github/instructions/agentils.instructions.md` + `AGENTS.md`，供 Copilot/Codex 在开发 AgentILS 时读取。
> **本文件不应被 `packages/cli` 读取或注入到外部用户项目。** CLI 有自己独立的模板体系（`packages/cli/templates/`），内容是面向用户的行为约束。

## 术语表（Glossary）

文档与代码反复出现的内部术语，**第一次接触请先读这里**，否则其它章节里的 "Plan C 单 server"、"V1 任务循环" 之类的引用会读不懂。

- **Plan C** —— 部署拓扑决议：每个 workspace **只跑一个** HTTP MCP server，Copilot 与 VS Code 扩展共享同一份 `state://*`。完整图见 [`docs/flowcharts/01-plan-c-topology.md`](../flowcharts/01-plan-c-topology.md)。Plan A（每个客户端独立 stdio MCP）和 Plan B（stdio + IPC bridge）已被否决，文档里不再出现。
- **V1** —— 当前架构代号：所有任务推进收敛到**一个** task loop（`collect → plan → execute → test → summarize`）+ **3 个** MCP tool（`state_get` / `request_user_clarification` / `run_task_loop`）。V0 是早期散点架构（chat-participant、LM tool 散点、多个状态源、`new_task_request` / `approval_request` / `feedback_gate` / `verify_run` / `ui_session_*` 等旧 tool），**已全部移除**，调试时不要假设它们存在。
- **ECAM panel** —— `@agent-ils/quality-gate` 的 pre-commit TUI 渲染层，借自 A320 ECAM（Electronic Centralized Aircraft Monitor）面板形态，给 husky pre-commit 一块带旋转指示与颜色块的可视化检查清单。详见 [`docs/instructions/quality-gate.instructions.md`](quality-gate.instructions.md)。
- **TCAS / ECAM 法则**（webview 语境）—— TCAS 是 webview 端的相邻冲突检测；ECAM 是控制模式（normal/alternate/direct）降级追踪器，写入 `vm.task.controlModeHistory[]`。详见 [`docs/instructions/webview-source-of-truth.instructions.md`](webview-source-of-truth.instructions.md) `## TCAS / ECAM 法则`。
- **Control modes** `normal / alternate / direct` —— 借自 Airbus fly-by-wire 法则降级阶梯，描述 task loop 的三档执行严格度：`normal`（全约束）→ `alternate`（部分约束放宽）→ `direct`（最低约束、用户全权接管）。

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
- npm 包名（**仅 quality-gate 和 logger 实际发布**）：`@agent-ils/quality-gate`、`@agent-ils/logger`。`@agent-ils/mcp` / `@agent-ils/cli` 是仓库内部 workspace 包，标了 `"private": true`，**不发 npm**。扩展 publisher：`bugfix2020`。
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

- 每个 npm 包应该有自己的 `packages/<name>/CHANGELOG.md`，记录该包的版本变更。**不要**在仓库根目录维护一个聚合 CHANGELOG。
- **可发布到 npm 的包（2 个）**：`@agent-ils/quality-gate`、`@agent-ils/logger`。
- **不发布到 npm 的包**：`@agent-ils/mcp`、`@agent-ils/cli`（半成品，未来若要发先去掉 private）。**真正阻止 publish 的机制是 `package.json` `"private": true`**（changesets 官方文档明确：`ignore` 字段只影响 `version` 命令，**不影响 `publish`**）。`.changeset/config.json` 的 `ignore: ["@agent-ils/mcp", "@agent-ils/cli"]` 仅作冗余防护，不要依赖它单独生效。
- **私有包（自动跳过）**：`packages/extensions/agentils-vscode`、`apps/webview`（`"private": true`）。
- 工具：[`@changesets/cli`](https://github.com/changesets/changesets) 已在仓库落地，配置见 [`.changeset/config.json`](.changeset/config.json)（`baseBranch: main`、`access: public`、`fixed: []`、`ignore: ["@agent-ils/mcp", "@agent-ils/cli"]`）。
- 工作流：
    - 每个改动了**可发布**包（`packages/quality-gate/*` 或 `packages/logger/*`）的 PR 必须配套运行 `pnpm changeset`，按交互提示选择受影响的包和 bump 类型（patch / minor / major），生成 `.changeset/<name>.md` 并随 PR 提交。**CI 会强制检查**（[`.github/workflows/ci.yml`](.github/workflows/ci.yml)），缺失则 PR 红灯。
    - 改动 `packages/mcp/*`、`packages/cli/*`、`packages/extensions/*`、`apps/*`、`scripts/*`、`docs/*` 或 `.changeset/` 配置本身可豁免（CI 自动跳过检查）。
    - Release **完全自动化**，不需要手动跑命令：
        - PR 合并到 `main` 后，[`.github/workflows/release.yml`](.github/workflows/release.yml) 触发 [`changesets/action`](https://github.com/changesets/action)：
            - 如果 `.changeset/*.md` 存在 → 自动开（或更新）一个 `chore(release): version packages` PR，PR 内容是 `pnpm changeset version` 的产物（bump version + 写 per-package CHANGELOG）。
            - 当那个 Version PR 被 merge 后（`.changeset/*.md` 全部消费完）→ action 自动跑 `pnpm changeset publish`：发布到 npm + 打 git tag + 推送。
        - 维护者**只需 review 并 merge Version PR**，不要在本地跑 `pnpm changeset version` / `publish`。
    - 前置条件：每个**可发布**包（`@agent-ils/quality-gate`、`@agent-ils/logger`）必须在 npm 注册 **Trusted Publisher（OIDC）**，指向本仓库 + workflow `release.yml`。配置入口：`https://www.npmjs.com/package/<pkg>/access` → Trusted Publisher → GitHub Actions。**不需要** `NPM_TOKEN` secret，OIDC 直接通过 GitHub Actions `id-token` 完成认证，并自动带 `--provenance` 签名。
- **不要**在 pre-commit / pre-push 阶段跑 changelog 生成（这会污染 commit 范畴、产生噪音 chore 提交、模糊"已发布"语义）。仓库根的 `.husky/pre-push` 和 `package.json` 里曾经的 `changelog` / `generate:changelog*` 脚本均已废弃删除，不要复活。

## CI（**强约束**）

GitHub Actions 工作流位于 [`.github/workflows/`](.github/workflows/)：

- **`ci.yml`** — PR 与 `main` push 触发：install / **build → typecheck**（顺序固定，typecheck 必须在 build 后，因为 workspace 间类型解析依赖 d.ts；turbo `typecheck.dependsOn` 包含 `^build`）/ lint / `sync:instructions:check` / changeset 存在性检查。所有 PR 必须全绿才能合并。test 步骤当前**注释**，TODO 在 workflow 内（pre-existing mcp e2e drift：`packages/mcp/test/e2e/agentils-vsix-parity.test.ts`）。
- **`release.yml`** — `main` push 触发：跑 `changesets/action`，自动管理 Version PR + npm publish + git tag。详见上方 changelog 章节。

### CI 内部约束（**避免重新踩坑**）

- **action 版本**：`actions/checkout@v6`、`actions/setup-node@v6`、`pnpm/action-setup@v6`（Node 24 native）。**不要降到 v4 / v5**，否则会出 "Node 20 deprecated" warning 或被强制提升到 Node 24 的过渡告警。
- **Node runtime 分工**：`ci.yml` 用 Node 22 LTS（项目目标 runtime）；`release.yml` 单独用 **Node 24**，因为它自带 npm 11.5+，满足 OIDC Trusted Publisher 最低要求。**禁止**在 release job 写 `npm install -g npm@latest`：Node 22 + npm 11.5 self-replace 会撞 bundled-deps 解析 bug，报 `MODULE_NOT_FOUND 'promise-retry'`，`--force` 也救不了。
- **OIDC Trusted Publisher**：`release.yml` 的 job 必须有 `permissions.id-token: write`；step env 用 `NPM_CONFIG_PROVENANCE: "true"` 自动签 provenance。**禁止使用 `NPM_TOKEN`** —— 已迁移到 OIDC，token 流是历史方案。
- **ESLint v9 flat config 不读 `.gitignore`**：必须在 `eslint.config.mjs` 显式 `ignores`：`packages/*.back/**`、`.tmp/**`、`**/scripts/**/*.mjs`，新增构建产物或测试 fixture 路径同步加入。
- **`.gitignore` 必须包含 `.agent-ils/`**：是 `@agent-ils/logger` 的本地 JSONL artifact，测试副作用产物，曾被误提交。
- **`process.versions` 不含 `npm` key**：检查 npm 版本一律走 `npm --version` shell 命令，不要写 `process.versions.npm.split(...)` —— 会 TypeError。

不要绕过 CI 直接 push 到 `main`（GitHub Flow 已经强制 PR 流程）。本地的 husky hook 是辅助防线，不是真值源 —— CI 才是。

## 文档语言规范（**强约束**）

为什么放在 instruction：这是 always-on 硬规则（任何改 `.md` 都触发），不是按需调用的工作流，所以走 instruction，不做 skill。

**核心原则**：

1. **面向开发者的文档（`docs/instructions/`、`docs/skills/`、`docs/flowcharts/`、`docs/agentils/` 等）默认中文**。代码标识符、CLI 名、错误关键字保留英文。
2. **面向外部用户的文档（root `README.md`、各 `packages/*/README.md`）必须中英双语**：`README.md`（英文） + `README.zh-CN.md`（中文）成对出现，文件顶部互相链接。
3. **当面向用户的文档（如 root `README.md`）引入了一份 `docs/` 下文档，那份 `docs/` 文档也必须是双语对**：`xxx.md`（英文） + `xxx.zh-CN.md`（中文），顶部互链。
4. **同步规则**：改 `xxx.md` 的同时必须改 `xxx.zh-CN.md`（反之亦然）。新加段落必须在两份里都加。**禁止只改一份就提交**。

**触发判断**：

- 新建 `docs/` 下文档 → 默认中文单文件。如果它会被 root `README.md` 或外部包 `README.md` 链接 → 升级为双语对。
- 改 root `README.md` 或包 `README.md` → 必须同步改对应 `README.zh-CN.md`。
- 改双语对中的任一文件 → 必须同步改另一份。
- commit message：subject + body 必须**全英文**（受 commitlint conventional commits 约束 + 跨地域 reviewer 友好），禁止中文出现在任何 commit message 字段。

**举例**：

- root `README.md` 引入了 `docs/developer/ci-release-pipeline.md` → 必须有 `docs/developer/ci-release-pipeline.zh-CN.md`，root 必须有 `README.zh-CN.md`，且 `README.zh-CN.md` 链接的是 `ci-release-pipeline.zh-CN.md`。
- `docs/instructions/agentils.instructions.md`（开发者向）→ 单文件中文即可。
- `packages/quality-gate/README.md` 是 npm 包 README → 必须配 `README.zh-CN.md`。

