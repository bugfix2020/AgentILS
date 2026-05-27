# PRD: Browser Logger OverrideKey + Collector 就绪检测

## 简介

为 `@agent-ils/logger` 的 browser 入口新增两项能力：

1. **overrideKey 强制日志**：业务通过 `window.$agentILS.logger.overrideKey` 注入密钥，与 logger 配置的 `overrideKey` 匹配时，即使 `enabled: false` 也强制记录日志。适用于线上环境按需调试——默认关闭，匹配时按需开启。
2. **Collector 就绪检测**：发送日志前先探测 collector (`GET /api/health`)，未就绪时静默丢弃，避免产生大量 404 请求。

## 目标

- 运维/开发者可通过 `window.$agentILS.logger.overrideKey` 远程开启浏览器日志，无需重新部署
- Collector 未运行时浏览器不产生无效 HTTP 请求（消除 404 噪音）
- 零破坏性：不匹配 overrideKey 或未配置时行为与现有逻辑完全一致

## User Stories

### US-001: 配置 overrideKey 并在匹配时强制启用日志

**描述：** As a 开发者, I want 在 createBrowserLogger 中配置 overrideKey, so that 当业务注入相同 key 到 window.$agentILS.logger.overrideKey 时，即使 enabled: false 也能强制记录日志。

**验收标准：**

- [ ] `BrowserLoggerOptions` 新增可选字段 `overrideKey?: string`
- [ ] `child()` 继承父 logger 的 `overrideKey` 配置
- [ ] 当 `overrideKey` 已配置且与 `window.$agentILS.logger.overrideKey` 匹配时，`enabled: false` 被忽略，日志正常发送
- [ ] overrideKey 匹配前先检测 `typeof window !== 'undefined'`；window 不可用时（SSR / Node）overrideKey 机制不生效，直接走 `enabled` 原逻辑
- [ ] 当 `overrideKey` 未配置，或与 `window.$agentILS.logger.overrideKey` 不匹配时，`enabled` 行为与现有逻辑完全一致
- [ ] `overrideKey` 匹配检查在 `enabled` 检查之前执行（匹配时短路跳过 enabled 检查）
- [ ] Typecheck passes

### US-002: 声明 Window 全局类型

**描述：** As a 前端开发者, I want `@agent-ils/logger/browser` 导出中包含 `window.$agentILS` 的类型声明, so that 我在使用 TypeScript 时不会遇到类型错误。

**验收标准：**

- [ ] 在 `browser.ts` 中通过 `declare global { interface Window { $agentILS?: { logger?: { overrideKey?: string } } } }` 声明全局类型
- [ ] 类型声明仅在 browser 上下文生效（不在 Node 侧泄漏）
- [ ] Typecheck passes

### US-003: Collector 就绪探测——首次日志前检查 health

**描述：** As a 开发者, I want logger 在发送日志前先确认 collector 已经启动, so that 不会因为 collector 未运行而产生大量 404 错误。

**验收标准：**

- [ ] 新增内部 `collectorReady: boolean` 状态，初始为 `false`
- [ `collectorReady` 为 `false` 时，调用 `GET <endpoint>/api/health` 探测一次
- [ ] health 返回 `200` → `collectorReady = true`，继续发送日志
- [ ] health 失败（网络错误 / 非 200）→ `collectorReady` 保持 `false`，本次日志静默丢弃（返回 `{ ok: true, status: 204 }`）
- [ ] health 探测失败后启动 10 秒间隔的定时器，定期重试直到成功，成功后清除定时器
- [ ] health 探测使用与日志请求相同的 `fetchImpl` 和 `endpoint`（含 override 配置）
- [ ] health 探测不计入日志超时（使用独立的短超时，如 2000ms）
- [ ] `createBrowserLogger` 返回的多个 child 共享同一个 `collectorReady` 状态
- [ ] Typecheck passes

### US-004: 日志发送失败时触发 collector 重检测

**描述：** As a 开发者, I want 日志发送失败时自动标记 collector 为未就绪并触发重检测, so that collector 重启后 logger 能自动恢复发送。

**验收标准：**

- [ ] `postLog` 返回网络错误或非 2xx 响应时，`collectorReady` 重置为 `false`
- [ ] 重置后立即触发一轮 health 探测（失败则启动 10 秒重试定时器，与 US-003 一致）
- [ ] Typecheck passes

## 功能需求

- FR-1: `BrowserLoggerOptions` 接口必须新增可选字段 `overrideKey?: string`
- FR-2: enabled 判定优先级为：overrideKey 匹配 → `enabled` 配置 → 默认 `true`。overrideKey 匹配时强制视为 enabled
- FR-2a: overrideKey 匹配前必须先检测 `typeof window !== 'undefined'`；window 不可用时（如 SSR / Node 环境）overrideKey 机制不生效，直接走 `enabled` 原逻辑
- FR-3: 全局类型 `Window.$agentILS.logger.overrideKey` 必须在 browser 入口中声明
- FR-4: 日志发送前必须检查 collector 就绪状态；未就绪时静默丢弃（返回 `{ ok: true, status: 204 }`）
- FR-5: collector 就绪探测使用 `GET <endpoint>/api/health`，失败时每 10 秒重试一次直到成功
- FR-6: 日志发送失败时重置 collector 就绪状态为 `false`，并立即触发 health 重检测
- FR-7: health 探测使用与日志相同的 `fetchImpl` 和 `endpoint`（含 per-call override），使用独立短超时（2000ms）
- FR-8: 同一个 `createBrowserLogger` 实例及其所有 `child()` 共享 collector 就绪状态和重试定时器

## 非目标（范围外）

- 不做日志缓存/队列——未就绪时静默丢弃，不补发
- 不做 Node 侧 logger 的 overrideKey 支持
- 不做 `onDeliveryError` 回调的变更——collector 未就绪丢弃不触发 `onDeliveryError`
- 不做 health 探测间隔的配置化（固定 10 秒）

## 技术考量

- **当前代码结构**：`createBrowserLogger` 使用闭包工厂模式（`make` 函数），`child()` 通过递归调用 `make()` 创建。collector 就绪状态需要跨 `make` 调用共享，应将状态提升到 `createBrowserLogger` 闭包外层。
- **health 探测并发**：多个日志同时触发探测时需避免重复请求——可用 `Promise` 去重（in-flight probe）。
- **全局类型安全**：`declare global` 需确保仅在 browser 入口生效，不影响 Node 侧 `index.ts`。
- **Server 端无变更**：`GET /api/health` 已存在于 `packages/logger/src/index.ts:287`，无需修改 server。

## 成功指标

- `enabled: false` + 无 overrideKey 匹配 → 零 HTTP 请求
- `enabled: false` + overrideKey 匹配 → 日志正常发送
- collector 未启动 → 零 404 请求（仅 health 探测请求）
- collector 启动后 → 首次 health 通过，后续日志正常发送
- collector 中途崩溃 → 标记未就绪，10 秒后重试 health，恢复后自动继续
