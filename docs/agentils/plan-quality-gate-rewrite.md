# Quality-Gate 重写与 AgentILS 配置回填 — Plan

> 范围：[`packages/quality-gate`](../../packages/quality-gate)
> 状态：**v1 已实施（Step 2 + Step 3）**；v2 待用户确认（Step 1 + Step 4 + Step 5 + Step 6）
> 分支：`feat/quality-gate-ink-panel`
> 关联调研：本仓库内未单独落盘，结论已合并入本文档"调研结论"小节

---

## 0. 实施进度速览

| Step | 内容                                                     | 状态           |
| ---- | -------------------------------------------------------- | -------------- |
| 1    | 新增 `@agent-ils/banner` 包                              | ⏸️ v2          |
| 2    | 修复包管理器探测（含 npm 系 + 多 lock 冲突）             | ✅ **v1 完成** |
| 3    | 补齐 templates（eslint.config / turbo.json）             | ✅ **v1 完成** |
| 4    | cac 重写 CLI 入口（init / uninstall / precommit + shim） | ⏸️ v2          |
| 5    | ink 渲染 `--help`                                        | ⏸️ v2          |
| 6    | package.json + tsup 元数据回填                           | ⏸️ v2          |

### v1 落地变更摘要

- [`packages/quality-gate/src/index.ts`](../../packages/quality-gate/src/index.ts):
    - 新增 `LOCKFILE_TABLE` 收纳全部 6 种 lockfile（含 `package-lock.json` / `npm-shrinkwrap.json` / `bun.lock(b)`）
    - 重写 `findPackageManagerLockRoot` + 新增 `findAllLockMatches` / `packageManagerFromField` / `promptForPackageManagerOrThrow`
    - 重写 `detectPackageManager`：单 lock → 直接用；多 lock → 字段裁决 + warning / TTY 询问 / 非 TTY error；无 lock → 字段 / TTY 询问 / 非 TTY error；**移除硬编码默认 `'npm'`**
    - 新增 `--with-turbo` flag、`withTurbo` 字段、注入 `turbo.json` + 加 `turbo` devDep
    - `--with-eslint` 增强：除装依赖外，写 `eslint.config.mjs` + 注入 `@eslint/js` `typescript-eslint` devDeps + `lint` `lint:fix` scripts
- [`packages/quality-gate/templates/eslint.config.mjs`](../../packages/quality-gate/templates/eslint.config.mjs)（新增，通用化版本，删去仓库根 monorepo 特有 ignore）
- [`packages/quality-gate/templates/turbo.json`](../../packages/quality-gate/templates/turbo.json)（新增）
- [`packages/quality-gate/templates/help.txt`](../../packages/quality-gate/templates/help.txt)（描述更新）
- [`packages/quality-gate/src/precommit/panel.tsx`](../../packages/quality-gate/src/precommit/panel.tsx)（**stub** 补丁——历史遗留 ECAM 重写未完成，src/precommit/index.tsx 引用 panel.js 但文件缺失，本次只写最小 stub 让 typecheck/build 通过；完整 ECAM 面板留给 v2 处理）

### v1 验证

| 维度                                               | 结果                                                                                                                                         |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @agent-ils/quality-gate typecheck`  | ✅                                                                                                                                           |
| `pnpm --filter @agent-ils/quality-gate build`      | ✅ dist/index.js 67.11 KB / dist/precommit.js 6.72 KB                                                                                        |
| 多 lock + packageManager 字段 → warning + 字段裁决 | ✅ 实测通过（"! multiple lockfiles detected; using package.json packageManager=npm. Stale lockfile(s) to clean up: pnpm-lock.yaml (pnpm)."） |
| `--help` 含 `--with-turbo` / `--with-eslint` 描述  | ✅                                                                                                                                           |

### v1 偏差（与原 plan）

- **FC7 调整**：原 plan 写"复制仓库根 eslint.config.mjs 原文"。实际仓库根含 monorepo 特有 ignore（`packages/extensions/*/webview/**` `apps/e2e-userflow/test/**`），不应原样发给用户。已改为通用化最小版本：保留 typescript-eslint + 核心规则，删 monorepo 特有路径，添加通用 `coverage/` ignore。

### v1 Known issue（用户决定）

- [`packages/quality-gate/src/precommit/`](../../packages/quality-gate/src/precommit/) 整个目录是 untracked（上一轮 ECAM 工作未提交且 panel.tsx 缺失）。本次仅写最小 stub。**v2 需要决定**：
    - A. 完整重做 ECAM panel（继续 ink + Braille 路线）
    - B. 拉回 [`scripts/dev/pre-commit-gate.mjs`](../../scripts/dev/pre-commit-gate.mjs) 的简单 list 风格
    - C. 直接删 src/precommit 目录（precommit 子命令独立移到新包）

---

## 1. 背景与定位

[`packages/quality-gate`](../../packages/quality-gate) 是 **一次性工作区配置注入器**：

- 在用户/目标项目工作区写入 husky / lint-staged / prettier / commitlint / .czrc 等配置
- 提供 `precommit` 子命令作为宿主项目 `.husky/pre-commit` 钩子的 runner（ink ECAM 风格面板）
- **不是常驻服务**，不引入 `@agent-ils/logger` 的 HTTP 日志栈

本次重写不动其核心 setup 流程，只做：

1. 修复包管理器探测 bug
2. 补齐相对仓库根"黄金范本"缺失的模板
3. 用 `cac` 替换手写参数解析，统一 CLI 体验
4. 抽出共享 `@agent-ils/banner` 包供后续所有 CLI 复用
5. 按 `@agent-ils/mcp` 模板回填 package.json 元数据 / exports / dts

---

## 2. 调研结论（精简版）

### 2.1 仓库根 vs quality-gate templates 差距

**所有共同字段一字不差**：commitlint / prettier / lint-staged / .czrc / husky hooks / devDeps 版本号完全对齐。

| gate 当前缺的                                    | 仓库根状态                    | 优先级 |
| ------------------------------------------------ | ----------------------------- | ------ |
| `eslint.config.mjs` 模板（仅装依赖不写配置）     | 完整 typescript-eslint 配置   | **P0** |
| `turbo.json` 模板                                | 完整 pipeline                 | P1     |
| `.editorconfig`                                  | 仓库根也无                    | P2     |
| `.nvmrc` / `engines.node`                        | 仓库根 README 口头说 Node 20+ | P2     |
| `package-lock.json` / `npm-shrinkwrap.json` 探测 | —                             | **P0** |
| `.prettierignore` 缺 `coverage/`、`bun.lock*`    | 也缺                          | P1     |
| 多 lockfile 冲突提示                             | —                             | **P0** |

### 2.2 包管理器探测当前 bug

[`packages/quality-gate/src/index.ts`](../../packages/quality-gate/src/index.ts) 的 `findPackageManagerLockRoot`：

- ❌ 漏 `package-lock.json` / `npm-shrinkwrap.json`（npm 系完全不识别）
- ❌ 多 lockfile 共存时静默选第一个，无任何提示
- ❌ 都没找到 → 硬编码默认 `'npm'`，从不询问用户

### 2.3 修复后的探测策略

```
1. 扫所有 lockfile（含 npm 系，向上递归）
   ├─ 命中 1 个 → 直接采纳
   └─ 命中 ≥2 个 → 多 lock 冲突分支：
       ├─ package.json.packageManager 字段存在 → 用字段裁决 + warning 提示其他 lock 应清理
       └─ 字段不存在 → TTY 列表询问 / 非 TTY 报 error
2. 0 个 lockfile → 读 package.json.packageManager 字段
3. 字段也无 → TTY 询问 / 非 TTY 报 error（**不再默认 npm**）
```

### 2.4 支持的 lockfile 完整列表

| Lockfile                 | PM   | 当前支持      |
| ------------------------ | ---- | ------------- |
| `pnpm-lock.yaml`         | pnpm | ✅            |
| `package-lock.json`      | npm  | ❌ → **新增** |
| `npm-shrinkwrap.json`    | npm  | ❌ → **新增** |
| `yarn.lock`              | yarn | ✅            |
| `bun.lockb` / `bun.lock` | bun  | ✅            |

---

## 3. 实施步骤（Steps 1–6）

### Step 1 — 新增 `packages/banner` (`@agent-ils/banner`)

- 包路径：`packages/banner/`
- 出口：
    - `<Banner subtitle? version? />` ink 组件
    - `bannerText(opts)` 纯字符串 helper
- 资产：迁入 [`packages/quality-gate/templates/banner.txt`](../../packages/quality-gate/templates/banner.txt) 的 6 行 ASCII art
- 配色：每行一色（ECAM 调色板 cyan/green/amber/white/magenta 渐变，FC1 = 选项 C）
- 发布策略：`private: true`，仅 workspace 内部消费（FC4）
- 依赖：`react`、`ink`，build 工具复用 `tsup`

### Step 2 — 修复 `findPackageManagerLockRoot` + 新增 `resolvePackageManager`

文件：[`packages/quality-gate/src/index.ts`](../../packages/quality-gate/src/index.ts)

变更点：

- `findPackageManagerLockRoot` 改为返回 `Array<{ packageManager, lockFile, root }>`，收集**当前目录**所有命中的 lockfile（不含父目录的次要 lock，避免误判 monorepo）
- 仍保留向上递归的 root 探测以支持 monorepo 场景
- 新增 npm 系扫描：`package-lock.json` → npm，`npm-shrinkwrap.json` → npm
- 新增高阶包装 `resolvePackageManager(cwd, { interactive, packageJson })`：
    - 单一 lock → 直接返回
    - 多 lock → 优先用 `packageJson.packageManager` 字段裁决，warning 列出待清理的其他 lock；字段无则 TTY 询问 / 非 TTY error
    - 0 lock → 读字段；字段无则 TTY 询问 / 非 TTY error
- 移除"硬编码默认 `'npm'`"分支

### Step 3 — 补齐 templates

新增/修订文件（路径相对 [`packages/quality-gate/templates/`](../../packages/quality-gate/templates/)）：

| 文件                | 操作     | 来源                                                                             |
| ------------------- | -------- | -------------------------------------------------------------------------------- |
| `eslint.config.mjs` | **新增** | 复制仓库根 [`eslint.config.mjs`](../../eslint.config.mjs) 原文（FC7 = 复制原文） |
| `turbo.json`        | **新增** | 复制仓库根 [`turbo.json`](../../turbo.json) 原文                                 |
| `.prettierignore`   | **修订** | 添加 `coverage/`、`bun.lock`、`bun.lockb`                                        |

[`packages/quality-gate/src/index.ts`](../../packages/quality-gate/src/index.ts) 同步：

- `--with-eslint` 改为同时安装依赖 + 写 `eslint.config.mjs`
- 新增 `--with-turbo` 选项（默认 false）注入 `turbo.json`
- 模板拷贝清单与 [`scripts/copy-templates.mjs`](../../packages/quality-gate/scripts/copy-templates.mjs) 同步更新

### Step 4 — 用 `cac` 重写 CLI 入口

- 替换手写 `parseArgs`，改用 `cac`（与 [`packages/logger/src/cli.ts`](../../packages/logger/src/cli.ts) 风格一致）
- 子命令布局：
    - `agentils-quality-gate init [dir]` → 现有 @clack 交互流程
    - `agentils-quality-gate uninstall [dir]` → **新增**最小逆向：删 `.husky/` + 还原 `package.json` 的 `prepare/commit/format/format:check` scripts；**不删** prettier / commitlint / .czrc 配置（FC3）
    - `agentils-quality-gate precommit` → 现有 ink ECAM 面板（同进程渲染，不 fork，FC2）
    - 默认无子命令 → 渲染 banner + cac 自动 help
- `bin.agentils-precommit-gate` 保留作 thin shim：一行 `spawn agentils-quality-gate precommit -- "$@"`，向后兼容现有 `.husky/pre-commit` 调用链
- `--version` 走 cac 内置（读 package.json）

### Step 5 — ink 渲染 `--help`

- 实现 `renderHelpIfRequested(cli)` 拦截：命中 `--help` / `-h` 时不让 cac 走默认朴素文本输出，改为 `render(<HelpView banner usage commands flags examples />)`
- HelpView 复用 `@agent-ils/banner`，命令/flag 表格用 ink-table 风格手绘（不引入新依赖）

### Step 6 — package.json + tsup 元数据回填

按 [`packages/mcp/package.json`](../../packages/mcp/package.json) 模板补齐 [`packages/quality-gate/package.json`](../../packages/quality-gate/package.json)：

- 新增字段：`author` / `license` / `repository` / `homepage` / `bugs` / `keywords` / `engines.node` / `publishConfig` / `exports` / `types` / `module`
- `exports` 暴露：`"."`、`"./precommit"`、`"./templates"`（FC5，让用户可程序化读模板）
- 新增依赖：`cac`、`picocolors`、`@agent-ils/banner: workspace:*`
- [`tsup.config.ts`](../../packages/quality-gate/tsup.config.ts) 启用 `dts: true`，与 tsconfig `declaration: true` 对齐

---

## 4. Further Considerations 决策矩阵

| #   | 议题                                         | 选项                                                           | 推荐                                           |
| --- | -------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------- |
| FC1 | Banner 颜色方案                              | A 极简 cyan / B gradient-string 彩虹 / **C 每行一色 ANSI**     | **C**                                          |
| FC2 | precommit 执行模型                           | A 同进程 ink / B fork 子进程                                   | **A**（无 fork 开销）                          |
| FC3 | uninstall 最小实现                           | 仅删 .husky + 还原 scripts，**保留** prettier/commitlint/.czrc | ✅                                             |
| FC4 | banner 包发布策略                            | A `private:true` workspace 内 / B 发 npm                       | **A**（先内部用，待 cli/mcp 也用了再 publish） |
| FC5 | `exports` 是否暴露 `./templates`             | A 暴露 / B 不暴露                                              | **A**（低成本高扩展）                          |
| FC6 | 多 lock 冲突时是否用 packageManager 字段裁决 | A 是+warning 提示清理 / B 无脑要求用户清理                     | **A**                                          |
| FC7 | eslint.config 模板形态                       | A 复制仓库根原文 / B 抽最小子集                                | **A**                                          |

---

## 5. 不在本次范围内的事项（明确剔除）

- ❌ 不引入 `@agent-ils/logger`（setup 工具不需要 HTTP 日志栈）
- ❌ 不重写 [`packages/cli`](../../packages/cli) / [`packages/mcp`](../../packages/mcp) 的 CLI（下个 PR）
- ❌ 不新增 `.editorconfig` / `.nvmrc` 模板（P2，留给后续）
- ❌ 不生成 LICENSE / CONTRIBUTING.md / CHANGELOG.md / GitHub Actions 工作流
- ❌ 不修改 ECAM 面板的视觉效果（已在前序工作中收敛）

---

## 6. 验收标准

| 维度          | 标准                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| 类型检查      | `pnpm --filter @agent-ils/quality-gate typecheck` 通过                      |
| 构建          | `pnpm --filter @agent-ils/quality-gate build` 通过，输出 `dist/` 含 `.d.ts` |
| 包管理器探测  | 单 lock / 多 lock / packageManager 字段 / 无任何线索 4 种场景手测通过       |
| `--help` 输出 | ink 渲染的 banner + 命令/flag 表，非纯文本                                  |
| `--version`   | 读自 package.json                                                           |
| 兼容性        | `agentils-precommit-gate` 旧 bin 仍可被 husky 调用                          |
| Banner 复用   | `@agent-ils/banner` 可被 quality-gate import 使用                           |

---

## 7. 风险与回滚

| 风险                                  | 缓解                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------- |
| `cac` 替换手写 parseArgs 引入回归     | 保留现有 30+ flag 的语义；先单独提交，便于 revert                         |
| `@agent-ils/banner` 包初次创建        | private 不发布，零外部影响                                                |
| dts 开启拖慢 build                    | 实测 quality-gate 体量小，可接受；必要时仅生成 root index                 |
| 多 lock 冲突的 TTY 询问在 CI 环境失败 | 非 TTY 走 error 路径，CI 必须在 package.json 显式声明 packageManager 字段 |

---

## 8. 待用户确认

请回复确认或调整：

- Steps 1–6 是否同意
- Further Considerations FC1–FC7 是否同意推荐选项
- 不在范围内的事项（第 5 节）是否需要把某项拉回本次范围
