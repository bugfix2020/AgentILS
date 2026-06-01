# Product Handoff

## 需求

当前 `agentils-gate.config.mjs` 的 pre-commit pipeline 有个步骤叫 "SYNC COPILOT INSTRUCTIONS"，但实际上它同步的是**所有三个 agent**（Copilot, Claude Code, Codex）的指令、skills、agents 和 entry stubs。名称不准确，需要更新。

## 验收标准

1. 步骤 label 从 `SYNC COPILOT INSTRUCTIONS` 改为 `SYNC ALL AGENT INSTRUCTIONS`
2. 脚本命令不变（`node scripts/dev/sync-agent-instructions.mjs --stage`）
3. `pnpm run sync:instructions` 仍然正常工作
4. 没有其他文件被修改

## 非目标

- 不拆分成三个独立步骤
- 不修改 sync 脚本逻辑
- 不改变 instructions 的共享架构

## 影响范围

- `agentils-gate.config.mjs`：仅修改步骤 label

## 技术约束

- 保持脚本原子性
- 确保三个 agent 配置一致同步

## 验证方法

运行 `pnpm run sync:instructions` 确认脚本正常，检查生成的文件无变化。
