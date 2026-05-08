# CI / 发布流水线走读

> [English](ci-release-pipeline.md) · 简体中文
>
> **读者:** 需要理解 AgentILS 如何构建、测试、版本化、发布的维护者与贡献者。
> **最近更新:** 2026-05-06（PR #10 + OIDC release pipeline 完成后）
>
> 规则级约束的真值源在
> [`docs/instructions/agentils.instructions.md`](../instructions/agentils.instructions.md)
> （同步至 `.github/instructions/`、`AGENTS.md`、`.github/copilot-instructions.md`）。
> 本文档是**叙事走读**，与那些规则互补。

---

## TL;DR

两个 GitHub Actions workflow，每个一个 job，每次 push 到 `main` 时触发（CI 还会在 PR 上跑）：

| Workflow                                                               | 何时触发                 | Node                 | Job                                                              |
| ---------------------------------------------------------------------- | ------------------------ | -------------------- | ---------------------------------------------------------------- |
| [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)           | 每个 PR + push 到 `main` | 22 LTS               | 质量门禁（build → typecheck → lint → 同步检查 → changeset 检查） |
| [`.github/workflows/release.yml`](../../.github/workflows/release.yml) | 仅 push 到 `main`        | 24（自带 npm 11.5+） | `changesets/action`：开 Version PR 或通过 OIDC 发到 npm          |

可发布包：**`@agent-ils/quality-gate`**、**`@agent-ils/logger`**。
其余（`@agent-ils/mcp`、`@agent-ils/cli`、`agentils-vscode`、`agentils-vscode-webview`）均为 `"private": true`，永不上 npm。

---

## 分支模型：GitHub Flow（无 `dev` 分支）

- `main` 是唯一长期分支。
- 功能分支从 `main` 切，PR 回 `main`，**squash and merge**，然后删掉功能分支。
- 命名见 [`branch-name-standard` skill](../skills/)。
- 缘由：PR #6（2026-05）合并发生在后续 push 之前，结果在一个幽灵 `dev` 分支上丢工作 —— `dev` 模型对 1–2 人贡献的仓库零收益但有同步成本。决议见 PR #9。

---

## `ci.yml` —— 质量门禁

每个 PR 与每次 push 到 `main` 时触发。**必须全绿才能合并。**

```
checkout (actions/checkout@v6)
  ↓
install pnpm (pnpm/action-setup@v6)
  ↓
setup node 22 LTS (actions/setup-node@v6) + pnpm 缓存
  ↓
pnpm install --frozen-lockfile
  ↓
pnpm build                # 必须早于 typecheck —— workspace 包之间
                          # 通过 .d.ts 互相解析
  ↓
pnpm typecheck            # tsc --noEmit 跑遍所有 workspace 包
  ↓
pnpm lint                 # ESLint v9 flat config
  ↓
pnpm sync:instructions:check
                          # 校验 .github/instructions/、AGENTS.md 等
                          # 与 docs/instructions/ 一致 —— 防止有人
                          # 手写生成镜像
  ↓
.changeset 存在性检查
                          # PR 改了 packages/quality-gate/* 或
                          # packages/logger/* 但没加 .changeset/*.md，
                          # CI 失败。其他路径不要求。
  ↓
（test step 当前注释 —— workflow 里 TODO 指向 mcp e2e 测试 pre-existing
 漂移，跟踪在 packages/mcp/test/e2e/agentils-vsix-parity.test.ts。）
```

### 为什么 `build` 在 `typecheck` 之前

workspace 包通过 `dist/index.d.ts` 互相依赖。在没有 turbo 缓存的干净 CI runner 上，先跑 `tsc --noEmit` 会因为依赖还没 emit 类型而报 `TS2307: Cannot find module '@agent-ils/<x>'`。`turbo.json` 里通过 `typecheck.dependsOn: ["^build", "^typecheck"]` 强制顺序。

### ESLint v9 flat config 坑

ESLint v9 的 flat config **不读 `.gitignore`**。`eslint.config.mjs` 必须显式列出 ignore：

```js
ignores: ['.tmp/**', '**/scripts/**/*.mjs', 'packages/extensions/*/webview/**']
```

新增构建产物目录或测试 fixture 路径时，要在 `eslint.config.mjs` 里同步加，否则 CI 会 lint 你不想 lint 的文件。

### `.gitignore` 必须包含

`.agent-ils/` —— `@agent-ils/logger` 测试时写入的本地 JSONL 产物目录。曾经被误提交。CI 跑测试套件会生成这些文件，绝不能进入提交。

---

## `release.yml` —— 版本化与发布自动化

**仅** push 到 `main` 时触发。与 `ci.yml` 并行跑（互相独立 —— 故意如此：发布失败不能阻断 PR 验证，反之亦然）。

### Job 级 setup

```yaml
permissions:
    contents: write # 自动开 Version PR 用
    pull-requests: write # 自动开 Version PR 用
    id-token: write # npm OIDC trusted publisher token 交换用
```

这里用 Node 24（不是 CI 的 22），原因：

1. npm Trusted Publisher（OIDC）要求 npm ≥ 11.5.1。
2. Node 24 自带 npm 11.5+ —— **不需要 `npm install -g` 步骤**。
3. 在 Node 22 上 `npm install -g npm@latest` 会让全局 npm 安装崩溃，报 `MODULE_NOT_FOUND: Cannot find module 'promise-retry'` —— npm 11.5 的 bundled-deps 树解到 Node 22 自带的 npm 10.x 布局上（`/opt/hostedtoolcache/node/22.x/lib/`）后 require 解析失败。`--force` 也救不了。换 Node 24 直接绕开。

### `changesets/action` 每次跑做什么

```
changesets/action@v1
  ├─ 扫 .changeset/*.md
  │
  ├─ 如果有 .changeset/*.md
  │     ↓
  │  开/更新一个标题为 "chore(release): version packages" 的 PR，
  │  内容是 `pnpm changeset version` 的输出：
  │    • bump 受影响包的 package.json version
  │    • 在每个受影响包 packages/<name>/CHANGELOG.md 顶部插入新条目
  │    • 删掉已消费的 .changeset/*.md
  │  那个 PR 合并后，本 workflow 再跑一次，进入下面 "无 changeset" 分支。
  │
  └─ 如果没有 .changeset/*.md
        ↓
     跑 `pnpm changeset publish`：
       • 遍历 workspace 中所有非 private 包
       • 对比本地 version 与 npm registry version
       • 任何本地 version 更新的包：
           - 发到 npm（OIDC token + provenance 签名）
           - 创建 git tag <pkg>@<version> 并 push
           - 创建 GitHub Release
       • 已经与 registry 持平的包静默跳过
```

### 为什么是 "private:true" 而不是 `.changeset/config.json` `ignore`

`.changeset/config.json` 的 `ignore` 字段**只影响 `version` 命令 —— 不影响 `publish`**（详见 [changesets 官方文档](https://github.com/changesets/changesets/blob/main/docs/config-file-options.md#ignore)）。

如果你想让一个包永远不上 npm，在它的 `package.json` 里设 `"private": true`。这是 `changeset publish` 唯一认的机制。

我们当前两个都保留：

- `package.json` `"private": true`（承重规则）
- `.changeset/config.json` `ignore: ["@agent-ils/mcp", "@agent-ils/cli"]`（纵深防御，防止有人不假思索把 `private` 关掉）

### OIDC Trusted Publisher

每个可发布包在 `https://www.npmjs.com/package/<pkg>/access` → Trusted Publisher → GitHub Actions 注册：

- Organization: `bugfix2020`
- Repository: `AgentILS`
- Workflow filename: `release.yml`
- Environment: （空）

这样 workflow 不需要长期 `NPM_TOKEN` secret —— npm registry 在发布时根据 GitHub 颁发的 OIDC ID token 铸造一个短期 token。发布自动带 provenance metadata（通过 `NPM_CONFIG_PROVENANCE: "true"` env），消费者可以验证 artifact 的构建来源。

**不要把 `NPM_TOKEN` 加回来。** 那会撤销安全收益，并引入需要轮换的凭证。

---

## 一次完整的发布

```
1. 从 main 切分支：
       git checkout main && git pull --ff-only
       git checkout -b fix/logger-default-paths

2. 在 packages/logger/... 改代码。

3. 生成 changeset：
       pnpm changeset
       # 交互式：选 @agent-ils/logger，选 patch/minor/major，
       # 写一行 summary。生成 .changeset/<random>.md

4. 提交并 push：
       git add -A
       git commit -m "fix(logger): correct default JSONL output path"
       git push -u origin fix/logger-default-paths

5. 开 PR 目标 main。CI（ci.yml）跑 —— 必须全绿。

6. Squash-merge PR，删功能分支。

7. 等 ~30 秒。看到两个 workflow run：
     CI #N      —— 在 main 上重新跑质量门禁；会绿。
     Release #N —— 开（或更新）一个标题为
                  "chore(release): version packages" 的 PR，
                  内容是基于你的 .changeset/*.md 的 version
                  bump 与 CHANGELOG 条目。

8. review 那个 Version PR。diff 显示：
     - packages/logger/package.json   version bumped
     - packages/logger/CHANGELOG.md   新条目插在前面
     - .changeset/<random>.md         被删掉

9. Squash-merge Version PR。

10. release.yml 再跑一次。这次没有 .changeset/*.md，
    所以跑 `pnpm changeset publish`：
      - 看到 @agent-ils/logger@<new> > registry version
      - 用 OIDC + provenance 发到 npm
      - 打 `@agent-ils/logger@<new>` tag 并 push
      - 创建 GitHub Release

你一条 publish 命令都没自己跑。
```

---

## 已经踩过的坑 —— 改 CI 时记牢

| 症状                                                                                                      | 根因                                                        | 修复                                                     |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------- |
| CI 里报 `TS2307: Cannot find module '@agent-ils/<x>'`                                                     | typecheck 先于 workspace 依赖 build `.d.ts`                 | `turbo.json` `typecheck.dependsOn` 必须含 `^build`       |
| ESLint 报 `.tmp/` 或 `*.back/` 里的文件                                                                   | flat config 不读 `.gitignore`                               | 加进 `eslint.config.mjs` 的 `ignores`                    |
| `.agent-ils/logger/logs/*.jsonl` 进了 `git status`                                                        | logger 测试副作用                                           | `.gitignore` 里加 `.agent-ils/`                          |
| `npm install -g` 后 `MODULE_NOT_FOUND: 'promise-retry'`                                                   | Node 22 + npm 11.5 自替换 bug                               | release.yml 用 Node 24；绝不 `npm install -g npm@latest` |
| 注释 "Node.js 20 is deprecated"                                                                           | actions 锁在 v4（Node 20 runtime）                          | actions 升到 `@v6`（Node 24 原生）                       |
| Release 发了半成品包                                                                                      | `.changeset` `ignore` 不阻止 publish                        | 在该包 `package.json` 里设 `"private": true`             |
| `node -e "process.versions.npm..."` 报 `TypeError: Cannot read properties of undefined (reading 'split')` | `process.versions` 没有 `npm` 这个 key                      | 用 `npm --version` shell 命令                            |
| 一次 push 到 `main` 触发两个 workflow run                                                                 | `ci.yml` 和 `release.yml` 都订阅了 `push: branches: [main]` | 不是 bug —— 设计上互相独立                               |

---

## 修改时去哪儿

- **Workflow 本身：** 直接改 `.github/workflows/{ci,release}.yml`。
- **规则 / 约束 / "你必须" 类话语：** 改 [`docs/instructions/agentils.instructions.md`](../instructions/agentils.instructions.md)，再跑 `pnpm sync:instructions`。绝不手写 `.github/instructions/*` 或 `AGENTS.md`。
- **本走读文档：** 直接改。叙事文档，不参与同步。
