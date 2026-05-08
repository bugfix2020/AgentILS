# AgentILS 通用开发规则

> **⚠️ 本文件是开发指引**，面向 AgentILS 项目本身的开发者。
> 通过 `sync-manifest.json` 同步到 `.github/instructions/agentils.instructions.md` + `AGENTS.md`，供 Copilot/Codex 在开发 AgentILS 时读取。
> **本文件不应被 `packages/cli` 读取或注入到外部用户项目。** CLI 有自己独立的模板体系（`packages/cli/templates/`），内容是面向用户的行为约束。

## 总则（Cardinal Rules，**所有 agent / IDE 强制遵守**）

> 这一节优先级最高，凌驾于本文件其余章节之上。任何 agent（Copilot / Codex / Cursor / Claude Code / 其它）在动手之前必须先读完本节。

1. **持久记忆必须落到文档，不允许只放在 agent 私有 memory 里。**
    - 真值源永远是 `docs/instructions/*.instructions.md` + 各包 `README.md` / `README.zh-CN.md`，由 `scripts/dev/sync-agent-instructions.mjs` 同步到 `.github/instructions/`、`.github/skills/`、`.agents/skills/`、`.github/copilot-instructions.md`、`AGENTS.md`。
    - **禁止**把仓库级规则只写进 `/memories/repo/` 或单一 IDE 的 `.cursorrules` / `.clinerules` / 任意 agent 私有 store——切换 agent（如 Codex ↔ Copilot 混用）会立即丢失记忆，导致行为不一致。
    - 仅当信息是**单次会话临时上下文**（如本次任务的进度笔记）才允许放 session memory。仓库长期规则一律走文档 + 同步脚本。

2. **代码提交流程：必须先自测再 commit。**
    - 仓库 husky pre-commit hook 链路：`@agent-ils/quality-gate` ECAM panel 串行跑 (a) `pnpm typecheck`、(b) `pnpm lint --filter <changed>`、(c) 受影响包 `pnpm build`、(d) `pnpm test --filter <changed>`（如配置）。任何一项 fail 都会阻止 commit。
    - **必须在调用 `git commit` 之前手动跑一遍**对应包的 typecheck + build + lint，确认本地绿，再交给 hook 复核。不要把 hook 当成第一道筛子。
    - 不允许使用 `--no-verify` / `git -c core.hooksPath=/dev/null` / `HUSKY=0` 等任何形式绕过 hook。`git -c core.hooksPath=.husky` 是允许的（它只是消除 husky 9 的可执行位提示警告，hook 仍会跑）。
    - CI（`.github/workflows/ci.yml`）会再跑一遍 install → build → typecheck → lint → sync:instructions:check → changeset presence；本地通过不等于 CI 通过，开 PR 后必须等 CI 绿才能请求合并。

3. **任何改动后必须判断是否需要更新 README / instruction，需要则同步更新。**
    - 改了包的对外行为（API、CLI 参数、配置项、命令、产物路径、依赖范围）→ 改对应包的 `README.md` + `README.zh-CN.md`（双语对，PR #12 立规）。
    - 改了内部架构 / 数据流 / 边界 / 流程 → 改对应 `docs/instructions/*.instructions.md` 真值源，再跑 `node scripts/dev/sync-agent-instructions.mjs` 同步。
    - 改了仓库通用流程 / 分支策略 / 发布流程 → 改 `docs/instructions/agentils.instructions.md`。
    - 不确定时**默认改**——遗漏更新比误更新代价高得多（agent 后续会按过时文档行动）。

4. **更新 README / instruction 之前必须先扫 legacy 内容，存在 legacy 则删除并基于实际代码重建。**
    - 扫法：先读对应文档全文 + 对应代码现状，比对差异，列出 legacy 段落（已废弃的术语、已删除的 tool 名、已改名的字段、已废弃的分支模型等）。
    - 删除 legacy 段落后，**基于业务逻辑当前实现**重写，**禁止盲猜**。不确定的细节用工具现场核实——具体方式取决于 agent 所在 IDE：用 grep / ripgrep / `Find References` / Language Server "show usages" / 仓库自带搜索工具 / `git log -p -S<symbol>` 等等，**任何能定位真实代码的方式都可以**，不要写死成某个 IDE 专属命令。
    - 历史教训（V0 → V1 迁移）：旧 tool 名 `new_task_request` / `approval_request` / `feedback_gate` / `verify_run` / `ui_session_*` 在 instructions 里残留过，导致后续 agent 调试时假设它们还在。现在术语表（Glossary）已显式声明"已全部移除"，新规则照此办理。

5. **Test-first：业务代码动手前先确认方案 + 测试用例，测试用例是唯一准则。**
    - 顺序固定：(1) 写需求 / 边界条件 → (2) 写 schema 与 I/O 合同 → (3) 写测试用例（含**反向测试** / negative test）→ (4) 才写实现。
    - **不要先写实现再补测试用例去"贴合"它**——这会让测试只覆盖已存在的代码路径，遗漏需求里本应失败的场景。
    - 反向测试至少覆盖以下 5 类场景，每类**先列再写**，不要漏:
        1. **非法输入**：类型错（应为数字却传字符串）、必填字段缺失、未知字段、空值（`null` / `undefined` / `""` / `[]` / `{}`）。期望：抛 schema 校验错或返回明确 error code，**不**静默成功。
        2. **边界值**：`0` / `-1` / `Number.MAX_SAFE_INTEGER` / 超长字符串 / 超大数组 / Unicode / 控制字符 / 空文件 / 单字节文件。期望：要么正常处理要么明确拒绝，不能 crash。
        3. **状态机非法转移**：在不允许的当前状态下调用某个动作。例如订单已是 `cancelled` 还要 `ship`、文件未 `open` 就 `read`、连接已 `closed` 还要 `send`、按钮 `disabled` 还能触发 click handler。期望：动作被拒绝并返回"非法转移"错，**当前状态保持不变**，不能半途修改字段后才报错。
        4. **并发 / 竞态**：同一资源被两个调用方同时创建/更新/删除（同 id 抢占）、长事务进行中又触发新事务、第一次请求超时后 server 才返回结果、文件锁已被另一进程持有。期望：要么用幂等键去重保证最终一致，要么显式返回冲突错（如 HTTP 409），**绝不丢数据也不双写**。
        5. **依赖故障**：网络断、DNS 失败、远端 5xx、文件系统只读 / 磁盘满、上游返回非预期 schema、JSON 解析失败、超时。期望：捕获后返回结构化错（带原因码 + 可重试标记），**不让原始异常 leak 到顶层**，不让一次依赖抖动拖垮整个调用方。
    - 实现技巧：用 `it.each([...])` 把同一类反向 case 表格化批量跑；写 schema 时把约束（min/max/enum/pattern）写满，让运行时验证替代手写 if 链。
    - 若测试用例本身逻辑不通，**视为业务需求理解错误**，回到第 (1) 步重新拆需求，不要硬改测试去贴实现。
    - 例外：纯粹的 UI 视觉调整 / 文档改动 / 脚本胶水代码可豁免 test-first，但功能性改动一律走完整流程。

6. **文档分层与归属（README vs docs vs 子包 instruction）。**
    - **README 面向用户**：仓库根 `README.md` + 各 npm 包 `packages/<name>/README.md`，回答"这是什么 / 怎么装 / 怎么用 / 给我看个 example"。**双语对**（`README.md` + `README.zh-CN.md` 互相 cross-link，PR #12 立规），任何用户可见行为变化必须双语同步。
    - **docs 面向开发者**：`docs/instructions/*.instructions.md` + `docs/agentils/*.md` + `docs/flowcharts/*.md` 等，回答"内部为什么这么设计 / 边界在哪 / 数据流怎么走 / 怎么调试"。中文单文件即可。
    - **`docs/instructions/agentils.instructions.md` 是总则**：只放跨包通用规则（核心原则、分支流、发布流程、术语表、本节这 6 条总则等）。**禁止下沉子包细节**——`packages/mcp` / `extensions/agentils-vscode` / `packages/cli` / `packages/quality-gate` / `packages/logger` 等的内部协议、API、目录结构、调试方式只能写在各自的 `<name>.instructions.md` 里。
    - **跨包关联只在子包文档里互相提及**：例如 `mcp.instructions.md` 里说"扩展通过 HTTP 连本服务"，`vscode-ext.instructions.md` 里说"thin bridge 不做业务，所有状态查 mcp"。总则只承认关联存在，不重复细节。
    - **尺度判断**：写一行内容前先问"这是面向用户的 how-to-use，还是面向开发者的 how-it-works？哪个包独有？"。如果是某个包独有的内部细节，立刻搬到子包 instruction；如果是用户可感知的对外行为，写 README。
    - 反例：把"mcp 的 8788 端口锁文件协议"写进总则、把"webview 的 TCAS 法则"写进根 README、把"质量门 ECAM panel 内部组件目录"写进 mcp.instructions.md ——都是越界。

## 术语表（Glossary）

文档与代码反复出现的**跨包**术语，**第一次接触请先读这里**。子包独有术语（webview 内部状态机命名、quality-gate ECAM panel 内部组件、各包 tool ID 等）不在这里展开，去对应 `<name>.instructions.md` 查。

- **AgentILS** —— 本项目代号；写作时一律 `AgentILS`，不写成 `Agentils` / `agentils` 等变体。
- **Plan C** —— 部署拓扑决议：每个 workspace 共享**一份** MCP server（HTTP + stdio 双 transport 同进程），Copilot 与 VS Code 扩展看到**同一份** orchestrator 状态。Plan A / Plan B（多 stdio 副本、IPC bridge）已被否决。
- **V1（当前 PoC）** —— 当前架构代号，对应单 `Orchestrator` + parked-promise 池 + 4 个 elicitation tool 的实现形态。**这是简化版 PoC，只验证 elicitation 闭环可行**，后续会主动回归 V0 风格的复杂分层架构（见下条）。V0 是更早的散点散点架构（chat-participant、多状态源、`new_task_request` / `approval_request` / `feedback_gate` / `verify_run` / `ui_session_*` / `state_get` / `run_task_loop` 等旧 tool 名），**已全部移除**，调试时不要假设它们存在；具体当前 tool 列表查 [`mcp.instructions.md`](mcp.instructions.md)。
- **V0 风格（后续 target，不是 stale）** —— 未来要回归的复杂分层架构：多 service（`conversation-service` / `task-service` / `summary-service` / `override-service` / `ui-actions`）、`gateway/` 层、`control-modes`（normal / alternate / direct）、`runTaskLoop` 决策树（`recall_tool` / `await_webview` / `return_control`）、`ResourceNotifier` per-client + `addNotifier/fanout`、`state://*` MCP resource 订阅、`acquireRuntimeLock` 文件协议、`taskPhase = collect/plan/execute/test/summarize` 状态机、独立 `audit-store` / `summary-store` / `task-store` 等。这些术语在 V1 主线**不存在**，但 `docs/flowcharts/{01-plan-c-topology, 02-v1-task-loop, 04-http-lock-startup, 06-vscode-activation, 07-control-modes}.md` 描述的就是这套 target spec。**核查 stale 时的判别**：术语只在 `docs/flowcharts/`、`docs/agentils/`、commit history 出现 = target spec，**禁止删**；术语在活代码（`packages/mcp/src/` / `packages/extensions/agentils-vscode/src/` / `apps/webview/src/`）出现 = 才是 stale，需要核查。
- **Elicitation** —— MCP 标准的"工具调用→挂起→等用户输入→恢复"机制；当前 4 个对外 tool 全部走这条路径。各 tool 的语义、字段与渲染合同放在子包 instruction 里，本总则不重复。
- **ECAM panel** —— `@agent-ils/quality-gate` 的 pre-commit TUI 渲染层，借自 A320 ECAM 面板形态。详见 [`quality-gate.instructions.md`](quality-gate.instructions.md)。

## 仓库结构

| 包               | 路径                                  | 角色                                                                                            |
| ---------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **MCP 控制平面** | `packages/mcp`                        | 唯一状态机真值源；同进程暴露 HTTP（默认 `http://127.0.0.1:8788/mcp`）+ stdio 两种 MCP transport |
| **VS Code 扩展** | `packages/extensions/agentils-vscode` | thin bridge：in-process 启动 mcp + WebView 渲染 + 注册 LM tool 给 Copilot                       |
| **CLI 配置工具** | `packages/cli`                        | 仅做 VS Code 配置注入（`init` / `uninstall`，写 `.vscode/mcp.json` stdio 条目）                 |
| **质量门**       | `packages/quality-gate`               | 独立可发布 npm 包：husky pre-commit 的 ECAM panel + 配置加载器                                  |
| **结构化日志**   | `packages/logger`                     | 独立可发布 npm 包：Browser/Node SDK + 本地 JSONL 收集 + 查询 CLI                                |
| **Webview**      | `apps/webview`                        | React WebView 产物，扩展加载；其消息合同是产品真值源                                            |

## 核心原则

本节只放**跨包通用**的设计法则。子包内部边界规则（store 之间怎么分工、webview 状态机怎么投影、cli 模板怎么落盘等）一律下沉到对应 `<name>.instructions.md`，不在总则展开（参见总则 Rule 6）。

### 1. 单一真值源

- 整个仓库的运行时状态唯一真值源是 `packages/mcp` 的 in-memory store。其它进程 / 模块 / WebView 看到的状态都是它的派生投影。
- 同一 workspace 在同一时刻**只允许一份** orchestrator 实例存活；当前由 VS Code 扩展 in-process 启动 mcp 来保证（不再依赖独立 lock-file 协议）。
- 派生状态只能从真值源单向流出，**禁止**在多个模块重复计算核心状态。

### 2. 三层职责边界

- **packages/mcp** —— 业务规则、状态机、所有 elicitation 的 park / resolve 逻辑。
- **packages/extensions/agentils-vscode** —— thin bridge：in-process 拉起 mcp、注册 LM tool 给 Copilot、桥接 WebView 与 mcp；**不**承载业务规则。
- **packages/cli** —— 仅做 VS Code 配置注入；**禁止**含运行时业务、**禁止**读 `docs/instructions/`。

修改代码前先确认变更属于哪个包；跨边界修改应被 review 阻止。

### 3. 单向数据流

```
外部输入（LM tool / HTTP / stdio / WebView）
        ↓
Orchestrator（park / resolve / 业务转移）
        ↓
Store（in-memory 真值源；可选 JsonStore 持久化）
        ↓
SSE 广播 + 视图层订阅（WebView / Copilot）
```

命令可以从多个入口进入；派生状态只有一个真值源。具体的 store 文件、SSE channel 名、广播协议等在 [`mcp.instructions.md`](mcp.instructions.md) 里描述。

### 4. 跨包契约的稳定性

- mcp 暴露的 elicitation tool 列表与字段、HTTP 端点形状、WebView postMessage 协议三者构成**对外契约**。一旦改动必须同步：mcp 的 instruction、对应消费方（vscode-ext / webview）的 instruction、以及任何引用它们的 README。
- 总则只承认契约存在，不在这里冻结具体清单——具体 tool / endpoint / message type 在子包 instruction 是真值源。

## 开发规范

- 读取顺序：先入口文件（`.github/copilot-instructions.md` / `AGENTS.md`），再总则（本文件），再 [`impl-debug.instructions.md`](impl-debug.instructions.md) 定位调用链，再按问题归属查对应子包 instruction。
- 不要一开始就全仓扫描；从当前调用链和模块边界出发。
- 优先采用测试先行（参见 Rule 5）；先定义 I/O 合同与 schema，再实现。
- 修改前对齐上下游 I/O 合同；优先信类型，不靠运行时猜测。
- 区分 task completion（任务终态）和 conversation completion（对话结束）；新任务入口必须显式。

## 命名约定

- 项目名固定 **AgentILS**（不写成 Agentils / agentils 等变体）。
- npm 包名（**仅 quality-gate 和 logger 实际发布**）：`@agent-ils/quality-gate`、`@agent-ils/logger`。`@agent-ils/mcp` / `@agent-ils/cli` 是仓库内部 workspace 包，标了 `"private": true`，**不发 npm**。扩展 publisher：`bugfix2020`。
- HTTP MCP 端点：默认 `http://127.0.0.1:8788/mcp`，可通过 `AGENTILS_HTTP_PORT` / `AGENTILS_HTTP_HOST` 覆盖。

## 分支与 PR 流（Branch Flow，**强约束**）

> 这条规则的违反代价极高，任何 agent 在开 PR 前**必须**确认 base 分支。

### Agent 操作权限红线（**所有 agent / IDE 通用**）

- **commit + push 是允许的默认动作**（包括 push 到 feature 分支、新建远端分支）。
- **开 PR 必须用户明确同意**。绝不自作主张调用 `mcp_gitkraken_pull_request_create` / `gh pr create` / 其它任何 PR 创建工具。即使 todo list 里写了"开 PR"也要先口头确认。
- **合并 PR / 删除分支（本地或远端）/ force push / 改 main 历史** 同样需要明确授权。
- 出错时立即关闭 PR（或请求用户关闭），分支默认保留等用户裁决，不要自行删除。
- 写在 commit message body 里的"将开 PR"不构成授权，必须等用户在对话里明确说"开 PR"或等价指令。

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
- **ESLint v9 flat config 不读 `.gitignore`**：必须在 `eslint.config.mjs` 显式 `ignores`：`.tmp/**`、`**/scripts/**/*.mjs`、`packages/extensions/*/webview/**`，新增构建产物或测试 fixture 路径同步加入。
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
