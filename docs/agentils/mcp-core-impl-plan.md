# AgentILS MCP 核心管线改造执行计划

版本：v1.0  
日期：2026-04-16  
所属：[task-execution-pipeline-plan.md](./task-execution-pipeline-plan.md)（对话 A 执行）  
范围：`src/` 目录

---

## 0. 执行前必读

1. 阅读 `AGENTS.md` 和 `.hc/codex-modular-debug.md`
2. 阅读 `.hc/copilot/task-pipeline-refactor.md`（完整对话记录和决策）
3. 阅读 `docs/agentils/task-execution-pipeline-plan.md`（总体改造计划）
4. **测试先行**：每个 Phase 先写测试断言，再修改实现

---

## 1. 改造目标

将任务执行管线从 5 步强化为 7 步（新增 approval + handoff_prepare），确保 normal/alternate/direct 三种法则下管线正确运转。

当前已有基础：
- `RunStep` 枚举已包含 `approval`、`handoff_prepare`
- `control-mode-orchestrator.ts` 已有 `beginApprovalRequest()` 和 `recordApproval()`
- `gateway/tools.ts` 已有 `approval_request` 工具（含 elicitation form）
- `verification-orchestrator.ts` 已有 verify + rollback 逻辑

需要补齐：step 推进门禁强制性、approvalPassed 字段、handoff_prepare 自动流转、HandoffPacket 结构化字段。

---

## 2. Phase 1 — 类型扩展

### 2.1 变更内容

文件：`src/types/task.ts`

1. `HandoffPacket` 接口新增字段：
   ```typescript
   changeSummary?: string[]     // 变更清单（文件路径或描述）
   impactScope?: string[]       // 影响面标注
   manualCheckpoints?: string[] // 需要人工检查的点
   ```

2. `TaskCard` / `RunRecord` 新增字段：
   ```typescript
   approvalPassed?: boolean     // 是否已通过审批
   ```

3. `createHandoffPacket()` 工厂函数更新：新字段默认为空数组。

4. `createRunRecord()` 工厂函数更新：`approvalPassed` 默认为 `false`。

### 2.2 测试（先写）

文件：`test/store/types.test.ts`（新建或追加）

- `createHandoffPacket()` 返回值包含 `changeSummary: []`、`impactScope: []`、`manualCheckpoints: []`
- `createRunRecord()` 返回值包含 `approvalPassed: false`

---

## 3. Phase 2 — 门禁强化

### 3.1 变更内容

文件：`src/control/gate-evaluators.ts`

`evaluateTaskExecutionGate()` 当前检查：
- `technicallyReady`
- `boundaryApproved`
- `policyAllowed`

新增第四个检查：
- `approvalPassed`：normal/alternate 模式下必须为 `true`；direct 模式下自动通过（不检查）

实现方式：函数签名需要接收 `controlMode` 参数（或从 run record 中读取）。

### 3.2 测试（先写）

文件：`test/control/gate-evaluators.test.ts`（已有，追加）

```
describe('evaluateTaskExecutionGate — approvalPassed', () => {
  test('normal 模式：approvalPassed=false → 拒绝')
  test('normal 模式：approvalPassed=true → 允许（其他条件满足时）')
  test('alternate 模式：approvalPassed=false → 拒绝')
  test('alternate 模式：approvalPassed=true → 允许')
  test('direct 模式：approvalPassed=false → 仍允许（direct 跳过审批）')
  test('direct 模式：approvalPassed=true → 允许')
})
```

---

## 4. Phase 3 — Step 推进拦截

### 4.1 变更内容

文件：`src/orchestrator/task-orchestrator.ts`

在 `upsertTaskCard()` 的 step 推进逻辑中增加两处拦截：

**拦截 1：plan → execute 强制经过 approval**
```
if (目标 step === 'execute' && 当前 step === 'plan' && controlMode !== 'direct') {
  if (!run.approvalPassed) {
    // 不允许直接跳到 execute，强制将 step 设为 approval
    实际推进到 'approval' 而非 'execute'
  }
}
```

注意：direct 模式下直接放行，不拦截。

**拦截 2：execute → verify 自动插入 handoff_prepare**
```
if (目标 step === 'verify' && 当前 step === 'execute') {
  // 自动插入 handoff_prepare
  实际推进到 'handoff_prepare' 而非 'verify'
}
```

### 4.2 测试（先写）

文件：`test/orchestrator/task-orchestrator.test.ts`（已有，追加）

```
describe('upsertTaskCard — step 推进拦截', () => {
  test('normal 模式：plan→execute 且 approvalPassed=false → 拦截为 plan→approval')
  test('normal 模式：plan→execute 且 approvalPassed=true → 放行')
  test('direct 模式：plan→execute → 直接放行（不检查 approvalPassed）')
  test('execute→verify → 自动拦截为 execute→handoff_prepare')
  test('handoff_prepare→verify → 正常放行（不再拦截）')
})
```

---

## 5. Phase 4 — handoff_prepare 自动流转

### 5.1 变更内容

新建文件：`src/orchestrator/handoff-orchestrator.ts`

```typescript
export class AgentGateHandoffOrchestrator {
  constructor(private store: AgentGateMemoryStore) {}

  /**
   * 当 step 推进到 handoff_prepare 时自动调用。
   * 收集交接物，写入 HandoffPacket，然后自动推进到 verify。
   */
  async prepareHandoff(runId: string): Promise<void> {
    // 1. 从 store 读取当前 run 和 taskCard
    // 2. 收集 changeSummary（从 run events 或 decisions 中提取）
    // 3. 收集 impactScope（从 taskCard.scope 提取）
    // 4. 收集 manualCheckpoints（从 executionReadiness.missingInfo 或 risks 提取）
    // 5. 写入 HandoffPacket
    // 6. 自动推进 step 到 verify
  }
}
```

触发点：在 `task-orchestrator.ts` 的 step 推进逻辑中，当 step 变为 `handoff_prepare` 时：
```typescript
if (newStep === 'handoff_prepare') {
  await this.handoffOrchestrator.prepareHandoff(runId)
}
```

### 5.2 测试（先写）

文件：`test/orchestrator/handoff-orchestrator.test.ts`（新建）

```
describe('AgentGateHandoffOrchestrator', () => {
  test('prepareHandoff 填充 HandoffPacket 的 changeSummary')
  test('prepareHandoff 填充 HandoffPacket 的 impactScope')
  test('prepareHandoff 填充 HandoffPacket 的 manualCheckpoints')
  test('prepareHandoff 完成后 step 自动推进到 verify')
  test('prepareHandoff 在无变更时仍能正常完成（空数组）')
})
```

---

## 6. Phase 5 — approval 控制法则感知

### 6.1 变更内容

文件：`src/orchestrator/control-mode-orchestrator.ts`

**`beginApprovalRequest()` 修改：**
- alternate 模式下：从 `taskCard.executionReadiness.risks` 或 `taskCard.assumptions` 中提取风险字段，附加到 approval request 的 `risks` 参数中
- direct 模式下：不发起 approval request，直接设置 `approvalPassed = true` 并推进 step

**`recordApproval()` 修改：**
- accept 时：调用 `store.updateRun(runId, { approvalPassed: true })`
- decline/cancel 时：不设置 approvalPassed，step 回退到 plan 或 confirm_elements

### 6.2 测试（先写）

文件：`test/orchestrator/control-mode-orchestrator.test.ts`（已有，追加）

```
describe('approval 控制法则感知', () => {
  test('normal 模式：beginApprovalRequest 正常发起')
  test('normal 模式：recordApproval accept → approvalPassed=true')
  test('normal 模式：recordApproval decline → approvalPassed 不变，step 回退')
  test('alternate 模式：beginApprovalRequest 附加 risks 字段')
  test('alternate 模式：recordApproval accept → approvalPassed=true')
  test('direct 模式：beginApprovalRequest 跳过，直接 approvalPassed=true')
})
```

---

## 7. Phase 6 — 回退路径验证

### 7.1 变更内容

主要是验证现有逻辑在新流程下仍正确，可能需要微调：

文件：`src/orchestrator/verification-orchestrator.ts`
- 确认 verify 失败时 step 回退到 `plan`（而非 confirm_elements）
- 确认 `approvalPassed` 在回退到 plan 时被重置为 `false`（需要重新审批）

文件：`src/orchestrator/task-orchestrator.ts`
- 确认 `upsertTaskCard()` 支持从 plan 回退到 confirm_elements（LLM 通过 step 参数直接设置）

### 7.2 测试（先写）

文件：`test/orchestrator/verification-orchestrator.test.ts`（已有，追加）

```
describe('回退路径', () => {
  test('verify 失败 → step 回退到 plan')
  test('verify 失败回退到 plan 时 approvalPassed 重置为 false')
  test('plan 阶段 upsertTaskCard step=confirm_elements → 成功回退')
  test('回退到 plan 后重新走 plan→approval→execute 路径')
})
```

---

## 8. 执行顺序

```
Phase 1（类型）→ Phase 2（门禁）→ Phase 3（step 拦截）→ Phase 4（handoff 自动流转）→ Phase 5（approval 法则感知）→ Phase 6（回退验证）
```

Phase 1 是所有后续 Phase 的前置依赖。Phase 2-6 之间有部分依赖但基本可以按顺序推进。

每个 Phase 内严格遵守：**先写测试 → 跑测试确认 fail → 修改实现 → 跑测试确认 pass**。
