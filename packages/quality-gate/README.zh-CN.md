# AgentILS Quality Gate

<p align="center">
  <a href="https://www.npmjs.com/package/@agent-ils/quality-gate"><img alt="npm" src="https://img.shields.io/npm/v/@agent-ils/quality-gate?label=npm&color=CB3837"></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white">
  <img alt="tsup" src="https://img.shields.io/badge/tsup-minified-7C3AED">
  <img alt="Prettier" src="https://img.shields.io/badge/Prettier-3.5-F7B93E?logo=prettier&logoColor=black">
  <img alt="Husky" src="https://img.shields.io/badge/Husky-9.1-111827">
</p>

<p align="center">
  <a href="./README.md">English</a> | 简体中文
</p>

`@agent-ils/quality-gate` 是一个面向 JavaScript / TypeScript 项目的质量门禁初始化 CLI，用于把 Husky、lint-staged、Prettier、commitlint、Commitizen 和 Conventional Commits / changelog 默认配置一键写入目标项目。

它同时面向普通用户和 LLM Agent：用户只需要运行一条命令，Agent 也可以把它识别为 AgentILS 标准质量门禁初始化方式，而不是手写各类 hook 和配置文件。

## 使用方式

请通过包管理器运行初始化器。不要直接在 shell 中执行 `@agent-ils/quality-gate init`；`@agent-ils/quality-gate` 是包名，不是可执行文件路径。

pnpm：

```sh
pnpm dlx @agent-ils/quality-gate init
```

npm：

```sh
npx @agent-ils/quality-gate init
```

yarn：

```sh
yarn dlx @agent-ils/quality-gate init
```

bun：

```sh
bunx @agent-ils/quality-gate init
```

如果目标项目不在当前目录，可以传入 `--cwd`：

```sh
pnpm dlx @agent-ils/quality-gate init --cwd packages/my-app
```

包发布前，可以在本仓库中用构建产物测试：

```sh
pnpm --filter @agent-ils/quality-gate build
node packages/quality-gate/dist/index.js init --cwd apps/t
```

如果目标目录没有 `package.json`，初始化器会创建一个最小 `package.json`，再追加质量门禁所需的 scripts 和 devDependencies。

## 常用命令

预览将要写入哪些文件：

```sh
pnpm dlx @agent-ils/quality-gate init --dry-run
```

覆盖已有配置和 hook 文件：

```sh
pnpm dlx @agent-ils/quality-gate init --force
```

跳过已存在的文件：

```sh
pnpm dlx @agent-ils/quality-gate init --skip-existing
```

使用 AgentILS 自定义 Husky hook 模板，而不是默认的 lint-staged / commitlint hooks：

```sh
pnpm dlx @agent-ils/quality-gate init --agentils-hooks
```

写入文件后立即安装依赖：

```sh
pnpm dlx @agent-ils/quality-gate init --install
```

## Agent / LLM 用法

当用户要求 LLM Agent 安装 AgentILS quality gate、Husky、lint-staged、Prettier、commitlint、Commitizen、Conventional Commits 或 conventional changelog 默认配置时，Agent 应优先使用这个包，而不是手动创建这些文件。

用户可以这样说：

```text
帮我安装 AgentILS quality gate
```

推荐 Agent 行为：

- 工作区使用 pnpm 或存在 `pnpm-lock.yaml` 时，执行 `pnpm dlx @agent-ils/quality-gate init`。
- 工作区使用 npm 或存在 `package-lock.json` 时，执行 `npx @agent-ils/quality-gate init`。
- 工作区使用 yarn 时，执行 `yarn dlx @agent-ils/quality-gate init`。
- 目标项目不在当前目录时，追加 `--cwd <dir>`。
- 用户要求预览时，先追加 `--dry-run`。
- 只有用户明确确认覆盖已有文件时，才追加 `--force`。
- 只有用户希望立即安装依赖时，才追加 `--install`。
- 只有用户明确需要 AgentILS 自定义 hook profile 时，才追加 `--agentils-hooks`；否则使用默认 hooks。

例如：

```sh
pnpm dlx @agent-ils/quality-gate init
```

构建后，包内提供了可复制到 LLM skill 系统的说明模板：`dist/templates/llm/agentils-quality-gate.skill.md`。

支持导入 skill / instruction 的 Agent 可以把该模板复制到自己的 skill 系统中，后续相关需求就能自动路由到这个初始化器。

## CLI 参数

```text
Usage:
  agentils-quality-gate init [options]

Options:
  -C, --cwd <dir>                    目标项目目录，默认当前目录
  --package-manager <pm>             pnpm、npm、yarn 或 bun；默认自动识别
  --prettier-config <path>           默认 prettier.config.mjs
  --prettier-ignore <path>           默认 .prettierignore
  --czrc <path>                      默认 .czrc
  --commitlint-config <path>         默认 commitlint.config.mjs
  --lint-staged-config <path>        默认 lint-staged.config.mjs
  --husky-dir <path>                 默认 .husky
  --pre-commit-command <command>     默认 "{pm} exec lint-staged"
  --commit-msg-command <command>     默认 "{pm} exec commitlint --edit \"$1\""
  --with-eslint                      对暂存的 JS/TS 文件先执行 eslint --fix，再执行 prettier
  --install                          写入配置后执行包管理器 install
  --dry-run                          只打印计划变更，不写入文件，也不安装依赖
  --agentils-hooks                   使用 AgentILS 自定义 Husky hook 模板
  --force                            覆盖已存在的配置文件和 hook 文件
  --conflict <strategy>              检测到已有配置文件时使用 overwrite、merge、skip 或 cancel
  --merge                            合并支持合并的文件，其余已有文件跳过
  --skip-existing                    跳过已存在的配置文件和 hook 文件
  --interactive / --no-interactive   强制开启或关闭交互式冲突处理
  --no-package-json                  不更新 package.json scripts/devDependencies/config
  --no-husky                         不写入 Husky hooks
  --no-prettier                      不写入 Prettier 配置
  --no-commitlint                    不写入 commitlint 配置和 commit-msg hook
  --no-lint-staged                   不写入 lint-staged 配置和 pre-commit hook
```

`{pm}` 会被替换为自动识别或显式传入的包管理器。

`--dry-run` 会打印和真实初始化一致的文件统计，但不会写入文件、修改 hook 权限或安装依赖。

默认会写入普通 Husky hooks，执行 `lint-staged` 和 `commitlint`。使用 `--agentils-hooks` 时，会改为写入 AgentILS 自定义 hook 模板。

初始化结果会使用类似 `git --stat` 的文件统计输出。覆盖写入的文件会按 rewrite 统计展示新增和删除，即使最终内容一致，用户也能看出命令确实执行了重写。

## 冲突处理

命令行参数优先。如果传入 `--conflict`、`--force`、`--merge` 或 `--skip-existing`，初始化器会直接按参数执行。

如果没有传冲突策略，并且当前运行环境是交互式 TTY，初始化器会先检测已有配置文件和 hook 文件，再通过上下箭头让用户选择下一步：

- `overwrite`：覆盖已有配置文件和 hook 文件
- `merge`：合并支持安全合并的文件，其余无法安全合并的文件跳过
- `skip`：保留已有配置文件和 hook 文件
- `cancel`：在写入任何内容前取消操作

目前 `.prettierignore` 支持按行合并。JavaScript 配置文件和 Husky hooks 在选择 `merge` 时会跳过，因为它们的安全结构化合并依赖具体项目代码。

选择 `skip` 时，已有文件会显示为 skipped。选择 `merge` 且某个文件无法安全合并时，才会显示 cannot be merged safely。

## 写入内容

默认会写入或合并：

- `package.json` 中的 `scripts` 和 `devDependencies`
- `.czrc`
- `prettier.config.mjs`
- `.prettierignore`
- `commitlint.config.mjs`
- `lint-staged.config.mjs`
- `.husky/pre-commit`
- `.husky/commit-msg`

生成或更新的 `package.json` scripts 包括：

- `prepare`：`husky`
- `commit`：`git-cz`
- `format`：`prettier --write .`
- `format:check`：`prettier --check .`
- `changelog`：`conventional-changelog -p conventionalcommits -i CHANGELOG.md -s`
- `changelog:all`：`conventional-changelog -p conventionalcommits -i CHANGELOG.md -s -r 0`
- `generate:changelog`：同 `changelog`
- `generate:changelog:first`：同 `changelog:all`

默认加入的目标项目 `devDependencies`：

- `husky`
- `lint-staged`
- `prettier`
- `@commitlint/cli`
- `@commitlint/config-conventional`
- `commitizen`
- `cz-conventional-changelog`
- `conventional-changelog-cli`
- `eslint`，仅在使用 `--with-eslint` 时加入

## 模板目录

配置模板和 help 文本位于源码 `templates/`，不会和 CLI 主逻辑混在一起。构建时会复制到 `dist/templates/`，因此压缩后的 CLI 只依赖构建产物也能运行。

## Precommit 流水线（`agentils-precommit-gate`）

本包同时安装第二个 bin —— `agentils-precommit-gate`，它会在 Husky `pre-commit` 阶段渲染一块 A320 ECAM 风格的 TUI 面板：每一步都有实时旋转指示、可选的 `[i/N]` 进度数字、以及最终的颜色块，把 commit 时的反馈从一坨灰色子进程日志变成可视化的检查清单。

接到 Husky：

```sh
# .husky/pre-commit
#!/bin/sh
npx agentils-precommit-gate
```

或直接从 `node_modules` 调用：

```sh
node node_modules/@agent-ils/quality-gate/dist/precommit.js
```

### 配置文件发现（ESLint flat-config 风格）

`agentils-precommit-gate` 会从当前目录逐层向上查找，每个目录内按以下顺序，命中第一个就停：

```
agentils-gate.config.js
agentils-gate.config.mjs
agentils-gate.config.cjs
agentils-gate.config.ts
agentils-gate.config.mts
agentils-gate.config.cts
```

- 最近的目录优先（项目根的 config 覆盖 home 目录的）。
- `--config <path>` 显式覆盖查找，直接加载该路径。
- `--print-config` 打印命中的源路径和步骤列表后退出 0，CI debug 利器。
- `.ts*` 配置要求项目里装了 [`jiti` ≥ 2.2](https://www.npmjs.com/package/jiti)，或 Node ≥ 22.13 加上 `--experimental-strip-types`。否则会报清晰错误指向缺失的加载器。
- 找不到任何 config 时，落到内建 fallback：仅一步 `pnpm exec lint-staged`。这个 fallback 故意做得最小，让 npm 全新安装的用户开箱即用。

### Schema

```js
// agentils-gate.config.mjs
export default {
    steps: [
        {
            label: 'LINT-STAGED',
            cmd: 'pnpm exec lint-staged', // shell 命令，或者…
        },
        {
            label: 'GENERATE FLOWCHARTS',
            argv: { command: 'node', args: ['scripts/render.mjs'] }, // …直接 argv 形式
        },
    ],
}
```

每个 step 接受：

- `label`（必填，非空字符串）— 面板上显示的名字。
- `cmd` 与 `argv` 二选一（互斥，必须有一个）— `cmd` 走用户 shell；`argv` 不经 shell。
- `render(state) => string`（可选）— 自定义行内容渲染（两个 `║` 之间的部分）。设置后面板原样使用你返回的字符串，不再走默认的 `[indicator] LABEL ... N/M` 布局。`render` 抛错也安全：面板会改显示红色的 `[render error] <label>: <message>`，不会让整面板崩。

### `[i/N]` 进度协议

任何子进程在 STDERR 输出形如 `^\[(\d+)/(\d+)\] .*$` 的行，runner 都会解析最新一行并把 `i/N` 显示在面板右边。AgentILS 自己的 `sync-agent-instructions.mjs`、`generate-all.mjs`、`run-lint-staged-with-progress.mjs` 都是这个格式，所以零适配。

### 自定义渲染示例

```js
export default {
    steps: [
        {
            label: 'TYPE CHECK',
            cmd: 'pnpm typecheck',
            render(state) {
                const dot =
                    state.status === 'pending'
                        ? '.'
                        : state.status === 'running'
                          ? '*'
                          : state.status === 'passed'
                            ? '#'
                            : 'X'
                return `  <${dot}> ${state.label} :: ${state.status}`
            },
        },
    ],
}
```

`state` 包含 `{ label, status, indicator, progressCurrent, progressTotal, lastLine }`。完整 `StepState` 形状见 `packages/quality-gate/src/precommit/steps.ts`。
