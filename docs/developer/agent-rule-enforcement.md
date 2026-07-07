# Agent Rule Enforcement

这份文档描述 AgentILS 当前的 rule enforcement pipeline。目标不是再写一层更强硬的 prompt，而是把仓库里已经存在、且能稳定机器判断的规则，下沉到 hook / CI / repository gate。

## 总体模型

```txt
Existing Guidance
  -> Rule Discovery / Classification
  -> Rule Registry
  -> Policy Engine
  -> Runtime Adapters
  -> Claude / Codex / Copilot Hooks
  -> Tests / CI / Documentation
```

对应实现：

- `scripts/agent-hooks/rules.mjs`：集中式 rule registry
- `scripts/agent-hooks/engine.mjs`：按 phase + strategy 执行检查
- `scripts/agent-hooks/adapters/*`：把 Claude / Codex / Copilot hook payload 归一化成 capability-based event，再把 decision 转回各自格式
- `scripts/agent-hooks/policy.mjs`：runtime hook 入口
- `scripts/agent-hooks/repo-check.mjs`：repository gate，给 CI / subagent-stop 使用
- `scripts/agent-hooks/render-rule-matrix.mjs`：生成规则矩阵
- `scripts/agent-hooks/test-policy.mjs`：Node 原生测试矩阵

## Capability Model

规则不再优先绑定某个 agent 产品名，而是绑定统一能力：

- `runtime-pre-tool`
- `runtime-stop`
- `patch-text`
- `write-targets`
- `command-text`
- `dirty-files`
- `changed-files`
- `added-files`
- `subagent-role`

adapter 的职责是把各 runtime 的 payload 提升成统一语义事件，例如：

- `apply_patch` -> `patchText` + `writeTargets`
- shell command -> `commandTexts`
- structured edit payload -> `writeTargets`
- repo diff / subagent diff -> `changedFiles` / `addedFiles`

因此以后兼容新 agent runtime 时，优先新增 adapter 映射，而不是在 engine 里继续加 provider 特判。

自动化验证不变量：

- 三家 runtime hook 配置都必须指向同一个 `scripts/agent-hooks/policy.mjs`
- `pre-tool` / `stop` 公共规则必须以 capability 为准，不能把 `claude` / `codex` / `copilot` 写死在 rule scope
- 同一语义输入（例如写 `AGENTS.md`）从不同 runtime 入口进入后，必须得到同一条核心 policy verdict
- 这些约束由 `scripts/agent-hooks/test-policy.mjs` 直接验证，而不是靠 reviewer 口头约定

## 分类原则

仓库规则不再一律当 prompt guidance 处理，而是分层：

- `guidance-only`
    - 无法稳定机器判断，保留给 LLM 和 reviewer。
    - 例子：chat 不得隐式结束、test-first 顺序。
- `pre-tool enforcement`
    - 能在工具调用前判断，直接 deny。
    - 例子：写生成型 agent 目标、写私有 memory、命令里带 `--no-verify`。
- `stop enforcement`
    - 只能在任务结束前判断，进入 stop gate，直接 block。
    - 例子：instruction 改了但没 sync、README 双语对只改一边。
- `subagent-stop enforcement`
    - 只适用于 Ralph 子代理边界，在角色完成前检查越权写入。
    - 例子：product 改源码、ops 改业务代码、developer 写 tester handoff。
- `ci enforcement`
    - agent runtime 看不到或不适合在本地 runtime 判定的规则，下沉到 repository gate / CI。
    - 例子：publishable package 改动缺 changeset。
- `git-hook enforcement`
    - 更适合提交入口阻断的规则，继续由 pre-commit / branch gate 承担。
    - 例子：禁止在 `main` 上直接工作。
- `manual-review`
    - 规则存在，但稳定自动化会造成高误报，保留给 reviewer。
    - 例子：webview 禁止自维护业务 state。

## 已强制化的规则

当前已经接入 enforcement 的规则，见生成矩阵：

- `docs/developer/agent-rule-matrix.md`

重点包括：

- generated agent target 只能改 `docs/` source，不能手写生成产物
- 仓库级规则不能写入 private memory / local-only rule files
- 禁止 `--no-verify` / `HUSKY=0` / `core.hooksPath=/dev/null`
- instruction source 改动后必须通过 `sync:instructions`
- root `README*`、package 根 `README*`、以及这些 README 直接链接的双语 `docs/*` 必须成对修改
- Ralph product / ops / contributor 不能越权改文件
- release-scoped package 改动必须带 changeset；当前 publishable set 是
  `quality-gate`、`logger`、`workflow-sdk`，且 `packages/logger-collector/**`
  归属 `@agent-ils/logger` release scope

## 为什么有些规则仍然不是强制层

不是所有文档规则都适合 hook。

- 有些规则需要完整语义上下文，而 hook 只能看到局部 payload。
- 有些规则是“顺序约束”，diff 结果无法证明作者先后顺序。
- 有些规则本质是架构判断，自动化很容易误杀正常重构。

因此，AgentILS 明确区分：

- “能稳定判断” -> 强制化
- “只能近似判断” -> manual review
- “根本看不到” -> guidance-only 或 external enforcement

## 新增规则流程

以后新增规则必须走下面的流程，而不是直接往 `policy.mjs` 塞 if/else：

1. 先把规则写进真实 guidance source。
2. 判断是否可机器检查。
3. 可检查则新增 `rules.mjs` entry。
4. 选择 phase：`pre-tool` / `stop` / `subagent-stop` / `ci` / `git-hook`。
5. 复用已有 `checkStrategy`；如果必须新增 strategy，放到 `checks.mjs`。
6. 补测试样本。
7. 重新生成 `agent-rule-matrix.md`。
8. 跑 `pnpm check:agent-hooks` 和既有 sync / CI 检查。

## 边界说明

- hooks 是 agent runtime enforcement，不是 OS 级 sandbox。
- shell 命令与路径识别仍是 best-effort，尤其是自由文本命令。
- 用户手动改文件、外部脚本写仓库，仍需要 git hook / CI / branch protection 补强。
- `guidance-only` 规则不能伪装成 enforced 规则，否则只会制造错误安全感。
