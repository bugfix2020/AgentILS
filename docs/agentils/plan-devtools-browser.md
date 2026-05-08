# @agent-ils/devtools — 浏览器侧通用线上调试器方案

> 状态: 设计稿 v2 (吸收 GPT-5.5 Pro 调研反馈 + 用户约束补充)
> 范围: 新增 packages/devtools / devtools-viewer / devtools-helper-go / devtools-extension
> 关联: [packages/logger](../../packages/logger/README.md) (开发期日志的姊妹方案)

---

## 0. 文档组织

```
1.  需求 (Why)              ← 业务痛点 + 三类角色 + 目标 + MVP 验收
2.  约束 (Constraints)       ← 必须遵守的硬边界
3.  总体架构 (How)           ← 完整拓扑图
4.  关键机制详解             ← fill / 多 frame trace / adapter / 激活 / 存储 / 落地 / PII
5.  Go helper (P1)           ← 极简实现 + 选型论证
6.  接入与使用流程 (E2E)     ← 业务方 / 用户 / 开发者三视角
7.  仓库布局
8.  路线图 + Phase 0 尖峰    ← 含 MVP 验收标准
9.  合规与隐私 (PIPL)        ← 入库前脱敏 + 数据生命周期
10. 风险与未决项
11. 调研反馈采纳记录         ← 8 项修订溯源
12. 参考
```

---

## 1. 需求

### 1.1 业务痛点

`@agent-ils/logger` 在**开发期**已能很好支撑链路日志收集。但产品上线到**用户设备**后:

- `console` / `debugger` 通常被禁用 (合规、混淆、性能);
- 用户报告"点击没反应"、"消息没送达",开发者**没有任何现场可看**;
- 链路本身很长: iframe 嵌套 + 跨 origin postMessage + EventSource SSE +
  项目自定义 IPC + WebView2 hostObjects, 任意一跳都可能断;
- 业务方为排查问题临时改代码、加 `console.log`、发紧急版本,
  **沟通成本高、影响发布节奏、用户须重启等待**.

### 1.2 三类角色 (Stakeholders)

```
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│ infra 开发者     │  →   │ 业务开发者       │  →   │ 不懂技术的用户    │
│ (本工具作者)     │      │ (产品代码)       │      │ (终端使用者)      │
└──────────────────┘      └──────────────────┘      └──────────────────┘
```

| 角色           | 关心什么                                         | 与本工具的关系                                                           |
| -------------- | ------------------------------------------------ | ------------------------------------------------------------------------ |
| **infra (你)** | 提供通用调试能力,覆盖多种环境,业务低侵入         | 编写核心 SDK + 自带 adapter,定义 adapter 协议                            |
| **业务开发者** | 不想为调试改代码、不想为调试发版、能定制项目语义 | 首次接入加 1 行 `import`,默认零配置即可用;需要专属语义时写自己的 adapter |
| **用户**       | 不懂技术,能"按指引操作 + 把文件发出来"就行       | 在开发者电话指导下激活面板 + 点导出 + 把生成文件发回来                   |

> 用户原话: "**让她把文件发过来是最简单的**" — 这是本工具的最终交付形态。

### 1.3 目标 (Goals)

1. **业务侧低侵入**: 接入只需一次性发版加 1 行 `import`,业务代码 0 改动,
   **后续不为调试再发版**。开关由外部 (URL / 快捷键 / gesture / 浏览器扩展) 控制,
   默认完全静默。
2. **链路完整可见**: 拦截标准浏览器 API + 项目自定义 IPC,按 `traceId` 跨 frame
   串联,**定位断在哪一跳**。
3. **可插拔生态**: 核心通用,业务环境特化通过 adapter 协议挂载 (类比 Vue.use /
   Sentry Integration / zustand middleware),自带 adapter 也允许业务方自写。
4. **离线落地**: 数据写在用户磁盘,**不强依赖任何远程 server**;
   用户把文件发回,开发者用 viewer 离线打开即可分析。
5. **环境覆盖**: Chrome / Edge / Firefox 标准浏览器、WebView2 嵌入、
   Tauri / Electron webview、VS Code webview、嵌入式 iframe 链路。
6. **零基础设施依赖**: **不依赖 CDN、不依赖远程 server、不依赖宿主端配合**。
   通过 npm 发布 + 业务方自打包 / 自托管。

### 1.4 Non-Goals

- 不替代 `@agent-ils/logger` (开发期日志)。两者互补: dev 用 logger,线上用 devtools。
- 不替代 Sentry / DataDog 等 APM (它们要求自托管 server,本工具不要求)。
- v1 不做服务端聚合 (用户原话: "服务器端不可行")。
- v1 不做开机自启的安装包 (Go helper 默认让开发者远程协助拉起)。

### 1.5 MVP 成功标准

> **用户可导出 + 开发者可看懂 + 支持团队可指导** —— 同时满足才算成功。

不以 "helper 自动落盘" 或 "全平台覆盖" 作为 MVP 验收 KPI。

---

## 2. 约束 (Constraints)

| 约束                                                              | 来源                                  | 影响                                                                                     |
| ----------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------- |
| 不能要求业务为调试发新版本                                        | infra → 业务方关系                    | 接入一次后,SDK 升级才需再发版,日常调试不发版                                             |
| 不能要求 C# / 宿主端配合                                          | 用户原话                              | 纯前端方案,不依赖 host 注入或宿主能力                                                    |
| 不能假设用户机器有 Node.js                                        | 用户原话                              | 兜底 helper 用单二进制 (Go)                                                              |
| **不能假设有 CDN**                                                | 用户补充                              | 所有分发走 npm 包 + 业务方自打包/自托管;扩展自带 SDK bytes                               |
| WebView2 默认禁用扩展且需宿主启用 (`AreBrowserExtensionsEnabled`) | Microsoft 官方                        | 扩展不作为 WebView2 通用激活方式;仅作普通 Chrome/Edge 的体验升级                         |
| 跨 origin iframe 不能由父 frame 注入子 frame                      | 浏览器同源策略                        | 每个 iframe 各自加 1 行 import                                                           |
| 跨域 fetch 自动塞自定义 header → 触发 CORS 预检                   | W3C CORS 规范                         | **默认仅同源**注入 traceId header;跨域走 adapter allowlist 显式开启                      |
| `showSaveFilePicker` 非基线 (Chromium 86+, 需 HTTPS + 用户激活)   | MDN                                   | 作为现代浏览器优化路径;`<a download>` 是必须保留的兜底                                   |
| Chrome LNA (Local Network Access) 权限正在收紧 localhost 访问     | Chromium                              | Go helper 不能作为 MVP 的 P0 前置依赖                                                    |
| 不能强冻结全局对象                                                | 与 Sentry / EventSource polyfill 共存 | 用 `__agentils_original__` 标记代替 freeze                                               |
| 默认本地存储,远端 server 可选                                     | 用户原话                              | IndexedDB → 用户手动导出 → 可选 helper 自动落盘                                          |
| **PII 默认入库前脱敏**                                            | PIPL 合规                             | 黑名单 (Authorization/cookie/token/邮箱/手机号) 落盘前 `[REDACTED]`;adapter 可白名单覆盖 |

---

## 3. 总体架构

```
                  ┌─ Tier 1: 浏览器扩展 (仅 Chrome/Edge 体验升级, P2) ─────────────┐
                  │   扩展自带 SDK bytes,不依赖 CDN                                │
                  │   ⚠ WebView2 / Tauri / Electron / VS Code webview 不走此路径    │
                  │      → 自动降级到 Tier 2-4 (URL hash / 快捷键 / 5 连点)         │
                  └─────────────────┬─────────────────────────────────────────────┘
                                    │ postMessage 广播激活
                                    ▼
┌──────────────────────────────────────────────────────────────────┐
│ Web Page (业务方一次性 import 一次,业务代码不动)                  │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ @agent-ils/devtools (in-page SDK)                            │ │
│ │                                                              │ │
│ │ activator/  ── Tier 1+2+3+4 同时监听,谁先触发用谁            │ │
│ │     ↓ activate()                                             │ │
│ │ core/fill + core/handlers (Sentry 风格 pub/sub)              │ │
│ │     ↓                                                        │ │
│ │ instrument/ ── 标准浏览器 API 一次 wrap,多订阅者复用         │ │
│ │   • fetch / xhr (同源默认注入 traceId, 跨域 allowlist)        │ │
│ │   • postMessage / message event                              │ │
│ │   • EventSource / WebSocket / sendBeacon                     │ │
│ │   • PerformanceObserver (兜底原生加载)                       │ │
│ │     ↓                                                        │ │
│ │ adapters/ ── 业务环境特化插件 (Vue.use 风格)                  │ │
│ │   • baiying / onepcweb / smb-container / vscode-webview      │ │
│ │   • 业务方可自写                                             │ │
│ │     ↓                                                        │ │
│ │ integrations/ ── 默认订阅者 (network/ipc/console/error)       │ │
│ │     ↓                                                        │ │
│ │ ⚠ PII redactor (落盘前) ── 默认黑名单 + adapter 白名单       │ │
│ │     ↓                                                        │ │
│ │ storage/ ── IndexedDB (+ persist()) → localStorage(5MB) → mem │ │
│ │     ↓                                                        │ │
│ │ transport/ ── 落地到磁盘                                     │ │
│ │   • <a download> (基线兜底, 全浏览器)                         │ │
│ │   • showSaveFilePicker (Chromium 86+ 增强)                   │ │
│ │   • clipboard.writeText (小数据兜底)                         │ │
│ │   • POST 127.0.0.1:7891/log (Go helper 可选, P1)             │ │
│ │ panel/ ── 浮窗 UI (vanilla DOM, 无框架依赖)                   │ │
│ └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────┬───────────────────────────────────┘
                               │ (Tier 3 自动落盘, P1, 仅嵌入式场景)
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│ agentils-helper (Go, ~2-5MB, 可选, P1)                            │
│  • 极简 HTTP 守护 (<80 行 Go 标准库)                              │
│  • 端点: /health  /log                                            │
│  • 落盘: ~/agentils-traces/{date}_{session}.jsonl                │
│  • 无 GUI / 无托盘 / 无 viewer / 无安装包                         │
│  • 走 GitHub Releases 分发 (不依赖 CDN)                           │
└──────────────────────────────┬───────────────────────────────────┘
                               │ [用户把文件发给开发者]
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│ 开发者侧 (P0)                                                     │
│  • @agent-ils/devtools-viewer (单 HTML 文件)                      │
│      拖入 .json / .jsonl → 时间线 + 跨 frame trace 串联           │
│      JSONL 分块懒加载,支持大文件                                  │
│  • 也可用 jq / 自写脚本 / 喂给 AI 分析                            │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. 关键机制详解

### 4.1 Sentry 风格 `fill()` + 发布订阅

借鉴 Sentry browser SDK 多年沉淀 ([blog](https://blog.sentry.io/wrap-javascript-functions/))。

`fill(target, name, factory)` monkey-patch 工业级实现:

- 用 `apply(this, arguments)` 转发,保留 `arguments.length` 与原生分支
- 标记 `wrapped.__agentils_original__ = original`,方便检测/还原/共存
- 保留 `function.length` (arity)
- `Object.setPrototypeOf(wrapped, original)` 保留原型链

核心 SDK 对每个浏览器 API **只 wrap 一次**, 对外暴露 `addInstrumentationHandler`,
让多个 integration / adapter 订阅同一事件源,避免重复包装互相干扰。

与 Sentry / DataDog / event-source-polyfill 等并存: **不冻结**,
靠先到先得 + 文档约束 (DevTools SDK 应在最早的 `import` 引入)。

### 4.2 多 frame trace 串联

- 每个 iframe 各自 import SDK (跨 origin 浏览器限制无法绕过);
- SDK 在出站 `postMessage` payload 上隐式注入 `__agentils_trace` 字段,
  业务读自己关心的字段感知不到;
- 入站 `addEventListener('message', ...)` 被 wrap 后自动捕获 `__agentils_trace`,
  把这一跳记录与对面 frame 的记录同 traceId 串联;
- **fetch / xhr 的 traceId header 注入策略 (修订)**:
    - **默认仅同源** 注入 `x-agentils-trace`
    - **跨域请求默认不注入** (避免触发 CORS 预检 + 改变后端兼容)
    - 业务 adapter 可显式 `allowlist` (`['api.baiying.com', 'inner.lenovo.com']`)
      后才注入跨域;
- 导出时按 traceId 把所有 frame 的记录合并成完整时间线:

```
trace_abc123  (用户点 "发送" 按钮)
├─ baiying    14:32:01.005  fetch_out        POST /chat (同源,注入 trace header)
├─ baiying    14:32:01.012  postMessage_out  → top {type:'mcpShell'}
├─ top        14:32:01.013  message_in       ← from baiying
├─ top        14:32:01.014  route            switch type='mcpShell'
├─ top        14:32:01.015  native_bridge    chrome.webview.SendMessage
├─ top        14:32:01.018  ⚠ 无后续记录
└─ ⚠ 缺失:    top → baiying 的回程 message
诊断: native bridge 调出去后没有回程,疑似 C# 端未应答
```

> **postMessage trace 注入的已知盲区**:
>
> - payload 是 `ArrayBuffer` / `MessagePort` / `Blob` / `ImageBitmap` 等非对象型 transferable: 无法注入 `__agentils_trace` 字段,该跳记为 `traceId: null`,在 viewer 里以"断链候选"高亮
> - payload 经 `structuredClone` 校验后为不可枚举对象 (例如 `Map` / `Set`): 同上
> - 业务方使用 `MessageChannel` 私有信道而非 `window.postMessage`: 不在拦截范围,需要业务 adapter 显式接入
> - 父子 frame 用 `BroadcastChannel`: 同样不在标准 postMessage 拦截内,需 adapter 自行登记

### 4.3 可插拔 adapter (Vue.use / zustand middleware 风格)

```ts
interface DevtoolsAdapter {
  name: string
  setup(ctx: AdapterContext): void | Promise<void>
  teardown?(): void
}

interface AdapterContext {
  on(event: 'fetch'|'xhr'|'postMessage'|'message'|..., handler): void
  record(entry: TraceEntry): void
  instrument<T>(target: object, prop: string, factory: (orig: T) => T): void
  panel: { addTab(spec): void; addRenderer(matcher, renderer): void }
  redact: { addDenyPattern(re), addAllowField(name) }   // PII 配置入口
  utils: { redact, normalizer, traceId }
  config: ResolvedConfig
}
```

- 业务方可写自己的 adapter,将项目专属 IPC 标签化、注入项目语义;
- adapter 与业务逻辑解耦,调试 bug 不影响产品;
- 我们维护 `devtools-adapter-baiying` / `-onepcweb` / `-vscode-webview` 等官方包。

### 4.4 4 层激活降级

```
Tier 1  浏览器扩展                    ← Chrome/Edge 体验升级,扩展自带 SDK bytes
Tier 2  URL hash / sessionStorage      ← 任意环境,不被 SPA router 抹掉
Tier 3  快捷键                         ← 任意环境,开发者电话指导
Tier 4  屏幕角落 5 连点                ← 傻瓜兜底,老人/不懂电脑用户
```

SDK 启动时同时注册全部 4 层 listener,谁先触发用谁。
WebView2 上 Tier 1 不可用 → 自动降级到 Tier 2-4。

> **Tier 2 选 hash 而非 query 的原因**:
>
> - 业务方 SPA router (Vue Router strict / React Router v6) 可能对未知 query 抛错或重定向时抹掉
> - 后端 SSR 中转 / 网关层可能把未识别 query 过滤掉
> - hash 不会发到服务器,纯前端可感知,不污染后端日志
> - sessionStorage 作为补充,允许"激活一次,刷新仍生效"
>
> 实际激活语义: `location.hash.includes('__agentils_devtools__')` 或 `sessionStorage.getItem('__agentils_devtools__') === '1'` 任一为真即激活。

### 4.5 三层 storage 降级 (修订: 加 persist + JSONL 分块)

```
Tier 1  IndexedDB                           ← 默认,容量 GB 级
        + navigator.storage.persist()       ← 激活后请求持久化,降低被回收风险
        + JSONL 分块写入 (每块 1MB)         ← 避免大文件 corrupt
Tier 2  localStorage (5MB 软上限)           ← 仅小型 trace 兜底
Tier 3  memory ring                         ← 最后兜底,进程内有效
```

启动时探测,自动选择。配额默认 50MB / 5000 条 / 24h,超出按 LRU + age 淘汰。
`localStorage` 因 5MB 限制不再作为中等 trace 兜底,仅在 IDB 不可用时短期临时用。

### 4.6 落地通道

```
通道 0  <a download>            ← 基线兜底,全浏览器全环境
通道 1  showSaveFilePicker     ← Chromium 86+ 增强,用户选保存位置最明确
通道 2  navigator.clipboard     ← 小数据 (<1MB) 一键粘贴到聊天工具
通道 3  POST 127.0.0.1:7891/log ← 自动落盘,要求用户机器跑 helper (P1)
```

**通道 0 是必须**,其他全是增强。

### 4.7 PII 脱敏 (修订: 入库前,不是导出前)

> PIPL 要求处理过程**全程**最小化,不仅在上传时遮敏感字段。

**默认黑名单** (落盘前 `[REDACTED]` 替换):

```
HTTP headers: Authorization, Cookie, Set-Cookie, X-Auth-*, X-Token-*
URL query:    token, access_token, refresh_token, sessionid, jwt
请求/响应 body 字段: password, pwd, secret, privateKey, apiKey,
                   email, phone, mobile, idCard, bankCard, address
正则匹配:     邮箱 / 手机号 / 银行卡号 / 身份证号
```

**adapter 可扩展**:

```ts
ctx.redact.addDenyPattern(/internal-secret-[a-z0-9]{32}/i)
ctx.redact.addAllowField('publicTraceId') // 显式允许某字段不脱敏
```

**导出时**: 不再做二次脱敏 (因为入库时已脱敏),但 viewer 提供"二次校验"按钮帮开发者
检查文件是否还残留疑似敏感字段。

> **入库前脱敏的已知盲区**:
>
> - `fetch(url, { body: ReadableStream })` 流式上传: 不消费 stream (会破坏业务调用),记录中只保留 metadata (URL / method / headers),body 标记为 `[STREAM_OMITTED]`
> - `FormData` 中的 `File` / `Blob` 字段: 不读取文件内容,只记 `{ filename, size, type }`,body 标记为 `[FORM_BINARY_OMITTED]`
> - WebSocket 二进制帧 / `BufferSource` send: 同 stream 处理,只记 `{ kind, byteLength }`
> - `fetch` opaque response (跨 origin no-cors): 受 CORS 限制不可读,记 metadata 即可
> - `Response.body` 流式响应 (SSE / fetch streaming): 不 tee stream,只记 metadata 和首末 chunk 长度
>
> 这些盲区不视为合规缺陷 — 既无法读到内容,也就不存在"漏脱敏"的风险面;但要在导出文件 schema 里显式标注 `omitted: <reason>`,让 viewer 可呈现"此跳 body 未捕获"。

---

## 5. Go helper (P1)

**唯一目的: 自动把日志写到本地磁盘**。无 GUI / 无托盘 / 无 viewer / 无 WebSocket。

> **与 `@agent-ils/logger` helper 的关系 (端口选型)**:
>
> 用户机器上有可能已经在跑 `@agent-ils/logger` 的 Node helper (`127.0.0.1:12138`)。
> 为避免两个 daemon 并存增加用户认知负担:
>
> - **方案 A (推荐 v1)**: devtools 不另起 helper,直接复用 logger helper 进程。
>   logger 包同步发版时新增 HTTP 路由 `/devtools/log`,落盘到 `~/agentils-traces/`。
>   一个进程,两种模式,通过路由 + payload schema 区分。代价: logger 包要随 devtools 节奏发版。
> - **方案 B (备选)**: devtools 走独立 Go 二进制 + 独立端口 `7891`,独立分发。
>   仅在 logger helper 不可达 (用户没装 Node) 时建议用此方案。
>
> v1 默认走方案 A;Phase 0 尖峰阶段如发现 logger 包发版节奏跟不上 devtools 迭代,
> 再降级到方案 B。本节后续描述以方案 B 的极简 Go 实现为参考,适用于"用户没装 Node"
> 的兜底场景。

```go
// agentils-helper.go (~80 行, 纯标准库, 0 依赖)
func main() {
  home, _ := os.UserHomeDir()
  dir := filepath.Join(home, "agentils-traces")
  os.MkdirAll(dir, 0755)

  http.HandleFunc("/health", healthHandler)  // SDK 探测
  http.HandleFunc("/log", logHandler)         // 追加 jsonl
  http.ListenAndServe("127.0.0.1:7891", nil)
}
```

**编译**: `go build -ldflags="-s -w"` → ~5MB; `upx --best` → ~2MB

**三平台输出**: `darwin-arm64` / `darwin-amd64` / `windows-amd64.exe` / `linux-amd64`

**分发**: 走 **GitHub Releases attachments**,不依赖 CDN。
开发者远程协助 (TeamViewer 等) 让用户下载并运行二进制。

**为什么从 P0 降到 P1**:

- Chrome 的 LNA (Local Network Access) 权限模型已收紧 localhost 访问,
  **HTTPS 页面直连 127.0.0.1 在 Chromium 上越来越不无感**;
- MVP 应该用纯前端通道 (download + showSaveFilePicker + clipboard) 闭环;
- helper 作为"嵌入式场景的体验升级",在第 1 阶段试点后再决定是否投入。

**Go vs 其他语言**:

| 替代                        | 为什么不选                                |
| --------------------------- | ----------------------------------------- |
| Rust / Zig                  | 体积更小但维护成本高,Go 已足够            |
| Python                      | 用户没 Python 环境,PyInstaller 打包 ~30MB |
| Node.js                     | 用户没 Node 环境 (用户原话)               |
| Tauri / Wails               | webview wrapper,复杂度高,无收益           |
| Electron                    | 包体积 150MB+,被排除                      |
| 浏览器扩展 native messaging | WebView2 默认不支持扩展                   |

---

## 6. 接入与使用流程 (E2E)

### 6.1 业务方接入 (一次性)

**主推: npm 包 + 业务 bundle (形态 A)**:

```bash
# baiying / onepcweb 等 (有完整打包流程)
pnpm add @agent-ils/devtools
pnpm add @agent-ils/devtools-adapter-baiying  # 可选官方 adapter
```

```ts
// main.ts / index.ts 第一行
import '@agent-ils/devtools/auto'

// 想配置:
import { devtools } from '@agent-ils/devtools'
import baiyingAdapter from '@agent-ils/devtools-adapter-baiying'

devtools.init({
    adapters: [baiyingAdapter()],
    storage: { quota: 50 * 1024 * 1024, persist: true },
    redact: { extraDenyList: [/internal-secret/i] },
    crossOrigin: { traceHeaderAllowlist: ['api.baiying.com'] },
})
```

→ 业务发版一次,加 1 行 `import`,**后续不为调试再发版**。

**兜底: IIFE 自托管 (形态 B,纯静态站)**:

```bash
# 业务方拷贝文件
npm pack @agent-ils/devtools                 # 拿到 tgz
tar xf agent-ils-devtools-1.0.0.tgz package/dist/auto.iife.js
cp package/dist/auto.iife.js ./public/static/agentils.js
```

```html
<!-- index.html 头部 -->
<script src="/static/agentils.js" data-config='{"adapters":["baiying"]}'></script>
```

→ 业务方完全自托管,不依赖任何 CDN。

### 6.2 用户安装 helper (可选, P1, 仅嵌入式场景)

开发者远程协助 (TeamViewer / 向日葵):

1. 从 GitHub Releases 下载 `agentils-helper-windows-amd64.exe` (~2MB)
2. 双击运行 (出现命令行窗口,最小化即可,不要关闭)

之后所有调试自动落盘到 `%USERPROFILE%/agentils-traces/`。

### 6.3 开发者调试时

```
开发者                          用户
─────────                       ─────────
                                正在使用产品,点了按钮没反应

电话指导用户:
"在地址栏后面加 #__agentils_devtools__"  →  访问 https://baiying/...#__agentils_devtools__
                                     SDK 检测到 hash → 写 sessionStorage → 浮窗出现
                                     (后续刷新页面仍保持激活,直到关闭标签页)

"现在重现一下刚才的问题"        →  操作产品, SDK 录全程

"右下角浮窗点 '导出 trace'"      →  优先 showSaveFilePicker (Chromium 86+)
                                     兜底 <a download> 落到下载目录
                                     (helper 在线则同时已自动落盘)

"把这个文件用微信发给我"        →  发送 trace-xxx.json

收到文件
打开 devtools-viewer.html
拖入 trace-xxx.json
→ 看到完整跨 frame 时间线
→ 高亮异常断点
→ 定位问题
```

---

## 7. 仓库布局

```
packages/
├── devtools/                              ← 核心 SDK (PR-A)
│   ├── core/             fill / handlers
│   ├── instrument/       标准 web API 全套
│   ├── adapters/         loader (类 Vue.use)
│   ├── integrations/     默认 breadcrumbs
│   ├── redactor/         PII 脱敏 (入库前)
│   ├── storage/          IDB+persist+JSONL / LS / memory + LRU
│   ├── transport/        download / showSaveFilePicker / clipboard / http
│   ├── panel/            vanilla DOM 浮窗
│   ├── activator/        4 层激活
│   └── package.json      exports: . / ./auto / ./adapters/*
│
├── devtools-viewer/                       ← 离线 HTML viewer (PR-B)
│   └── src/index.html    单文件,拖入 .json/.jsonl 即看 (JSONL 分块懒加载)
│
├── devtools-helper-go/                    ← Go 落盘守护 (PR-C, P1, 备选方案 B)
│                                            v1 优先合并入 logger helper (方案 A)
│                                            (复用 12138 端口 + 新增 /devtools/log 路由)
│   ├── main.go           <80 行 (仅在用户没装 Node 时启用)
│   ├── go.mod            纯标准库
│   └── scripts/build.sh  一键编译三平台 + GitHub Release upload
│
├── devtools-extension/                    ← 浏览器扩展 (PR-D, P2)
│   ├── manifest.json     MV3
│   ├── content-script.ts 注入扩展自带 SDK bytes (不依赖 CDN)
│   └── popup/            团队配置 UI
│
└── devtools-adapter-baiying/              ← 官方 adapter 范例
    └── (-onepcweb / -electron / -tauri 后续追加)

apps/webview/src/devtools-adapter.ts       ← AgentILS 自家 dogfood adapter (内联)
                                              不发包,验证 adapter 协议
```

---

## 8. 路线图

| Phase / PR           | 范围                                                                                                                                                    | 优先级      | 时长估               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------------------- |
| **Phase 0** 尖峰验证 | 选 1 普通 web + 1 WebView2 产品,验证 CSP / 跨域 iframe / 跨域 header / 导出链路是否通                                                                   | **P0 前置** | 1 周                 |
| **PR-A**             | `packages/devtools/` 核心 SDK + adapter 协议 + 默认 instrument + IDB+persist + JSONL + showSaveFilePicker + `<a download>` + 浮窗 + 4 层激活 + PII 脱敏 | **P0**      | 主体                 |
| **PR-B**             | `packages/devtools-viewer/` 单 HTML viewer + JSONL 分块懒加载                                                                                           | **P0**      | 与 A 并行            |
| PR-A.1               | `apps/webview/src/devtools-adapter.ts` AgentILS 自家 dogfood,接到 webview                                                                               | P0          | 与 A 并行            |
| **PR-C**             | `packages/devtools-helper-go/` Go 落盘守护 (<80 行) + GitHub Releases 三平台二进制                                                                      | **P1**      | MVP 后投入           |
| PR-E                 | `devtools-adapter-baiying/` `-onepcweb/` 官方 adapter                                                                                                   | P1          | 试点期               |
| PR-D                 | `packages/devtools-extension/` 浏览器扩展 (Tier 1 激活,自带 SDK bytes)                                                                                  | P2          | Chrome/Edge 体验升级 |
| PR-F                 | helper 开机自启脚本 (launchd / Windows 任务计划)                                                                                                        | P2          | 静默后台体验         |
| PR-G                 | 远程上传 transport (opt-in) + relay server 模板                                                                                                         | P2          | 团队级聚合           |

### MVP 验收标准 (Phase 0 + PR-A + PR-B)

- ✅ 业务方加 1 行 `import` 后无功能/性能 regression
- ✅ 用户在开发者电话指导下能 2 步内导出 trace 文件
- ✅ 开发者用 viewer 拖入文件能看完整跨 frame 时间线 + 异常断点
- ✅ 默认开启 PII 脱敏,导出文件不含黑名单字段
- ✅ Chrome / Edge / WebView2 三环境都能跑通
- ❌ **不要求** helper 自动落盘
- ❌ **不要求** 全平台覆盖
- ❌ **不要求** 浏览器扩展可用

---

## 9. 合规与隐私 (PIPL)

> trace 文件可能包含用户标识、聊天内容、请求 body、cookie、token 等,
> 进入个人信息处理范畴,需满足 PIPL 基本要求。

### 9.1 处理原则

| 原则             | 落实手段                                                    |
| ---------------- | ----------------------------------------------------------- |
| 合法、正当、必要 | 仅在 SDK 被显式激活后才采集;默认完全静默                    |
| 最小范围         | 默认黑名单脱敏 (4.7 节);adapter 仅按需 allowlist            |
| 公开透明         | 业务方接入文档需告知用户"产品具备调试日志能力,激活后才采集" |
| 准确、完整       | trace 带 schema version + checksum                          |
| 安全保障         | IDB 不加密 (浏览器沙箱),但导出文件可选客户端加密 (P2)       |
| 个人参与权利     | 用户可随时通过 panel 清空本地存储                           |

### 9.2 数据生命周期

```
采集 (激活后) → 入库前脱敏 → IDB 落盘 (默认 24h LRU)
            → 用户主动导出 → 文件落到用户磁盘
            → 用户手动发给开发者 (受用户选择控制,默认不上传)
            → 开发者本地 viewer 分析 → 分析结束应删除文件
```

### 9.3 数据出境

如出现境外开发者协助分析,trace 文件出境需评估:

- 是否涉及敏感个人信息 / 重要数据 / 关基场景
- 是否需要数据出境安全评估或标准合同
- 默认不引入远程 server,**避免出境路径**

### 9.4 个人信息保护影响评估 (PIA)

如未来扩展为团队级 relay server (PR-G),需做 PIA:

- 评估处理目的、方式、范围
- 评估对个人权益的影响
- 评估安全保护措施

---

## 10. 风险与未决项

### 已识别风险 + 缓解

| 风险                                                                            | 缓解                                                                                                   |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| CSP 严格,外部 script 被拦                                                       | 主推 npm 包 (业务自打包,bundle 内属同源);形态 B 自托管同样同源                                         |
| 业务方拒绝增加 bundle 体积                                                      | 核心 SDK 目标 < 30KB gzip;adapter 按需引入                                                             |
| 跨域 fetch header 注入污染观测对象                                              | 默认仅同源;跨域 allowlist;详见 4.2                                                                     |
| `showSaveFilePicker` 不可用                                                     | `<a download>` 永远是基线兜底                                                                          |
| Chrome LNA 阻断 helper                                                          | helper 降为 P1,纯前端通道 P0 闭环                                                                      |
| WebView2 扩展默认禁用                                                           | 扩展只作 Chrome/Edge 体验升级,不作 WebView2 通用激活                                                   |
| IDB 容量被回收                                                                  | 激活后 `navigator.storage.persist()` 请求持久化                                                        |
| 大 JSON 一次性 parse 卡死 viewer                                                | 强制 JSONL 分块 + viewer 懒加载                                                                        |
| 与 Sentry / DataDog 多重 wrap 冲突                                              | `__agentils_original__` 标记 + 不冻结 + 文档要求 SDK 最先 import                                       |
| postMessage 非对象型 payload (ArrayBuffer/MessagePort/Blob) 无法注入 trace 字段 | 已知盲区: 该跳记 `traceId: null`,viewer 标记"断链候选";业务 adapter 可显式登记私有信道                 |
| 流式 / 二进制 body (ReadableStream / FormData File / WebSocket binary) 无法脱敏 | 已知盲区: 不消费 body,只记 metadata + 标记 `[STREAM_OMITTED]` / `[FORM_BINARY_OMITTED]`;不视为合规缺陷 |
| Tier 2 URL 参数被 SPA router / SSR 中转抹掉                                     | Tier 2 改用 hash + sessionStorage 双通道,详见 §4.4                                                     |

### 未决项 (待 Phase 0 / 试点收敛)

- adapter 协议命名: `adapter` vs `middleware` vs `plugin` (倾向 `middleware`)
- npm scope: `@agent-ils/devtools` vs 独立 `@agentils-devtools/*`
- viewer 是否同时打成 PWA
- helper 端口选型: 优先复用 logger helper 进程 (方案 A);独立端口 7891 仅作 Node 不可用时备选 (方案 B);Phase 0 决定走哪条路
- PII 脱敏黑名单完整性 (Phase 0 时拉业务/安全 review)
- 试点产品候选: AgentILS webview 自身 dogfood **不替代** 真实业务试点 (倾向),Phase 0 在 baiying / onepcweb 做尖峰

---

## 11. 调研反馈采纳记录

> 本节追溯本设计稿相对 v1 草案的修订来源。

### 来源 1: 用户原话约束

| 修订                  | 用户原话                                                       | 落实位置                                    |
| --------------------- | -------------------------------------------------------------- | ------------------------------------------- |
| 不依赖 CDN            | "不建议你直接用 script 注入 最好是打成 npm 包 因为 cdn 我没有" | §2 约束表;§6.1 接入示例;§7 仓库布局 exports |
| 不依赖 C# / 宿主      | "你不要指望 c# 那边注入代码 我们只从前端的角度来说"            | §2 约束表;§5 helper 论证                    |
| 用户没 Node           | "用户电脑是不是有 nodeJS"                                      | §5 Go helper 选型对比                       |
| 服务器端不可行        | "服务器端不可行 这是属于我们前端的调试工具"                    | §1.4 Non-Goals                              |
| 让用户把文件发回来    | "让她把文件发过来是最简单的"                                   | §1.5 MVP 成功标准;§6.3                      |
| WebView2 降级 gesture | "如果是 webview2 这种不支持的呢 降级到连点"                    | §4.4 4 层激活降级                           |
| Go 不为秀肌肉         | "go 的目的是为了记录日志到本地 而不是为了秀肌肉"               | §5 helper 极简实现 (无 GUI/托盘/viewer)     |

### 来源 2: GPT-5.5 Pro 独立调研报告

| #   | 调研观点                                                                         | 处理      | 落实位置                        |
| --- | -------------------------------------------------------------------------------- | --------- | ------------------------------- |
| 1   | "零侵入"措辞过于绝对 → "一次性低侵入预埋"                                        | ✅ 采纳   | §1.3 目标;§6.1 接入示例         |
| 2   | 跨域 fetch 自动注入 header → 触发 CORS 预检                                      | ✅ 采纳   | §2 约束表;§4.2 traceId 注入策略 |
| 3   | "WebView2 不支持扩展" 假设过时 (官方有 `AddBrowserExtension`,但默认禁需宿主启用) | ✅ 采纳   | §2 约束表;§4.4                  |
| 4   | localhost helper 因 Chrome LNA 应降为 P1                                         | ✅ 采纳   | §2;§5;§8 路线图                 |
| 5   | PII 脱敏前置到入库前                                                             | ✅ 采纳   | §4.7 PII 脱敏;§9 合规           |
| 6   | localStorage 5MB 不适合主兜底;加 `persist()` + JSONL 分块                        | ✅ 采纳   | §4.5 storage                    |
| 7   | 加 Phase 0 尖峰验证 + MVP 成功标准                                               | ✅ 采纳   | §1.5;§8 路线图 + 验收标准       |
| 8   | 加 PIPL 合规章节                                                                 | ✅ 采纳   | §9 合规与隐私                   |
| -   | 改用 Sentry/Datadog/OTel 平台版                                                  | ❌ 拒绝   | 与"服务器端不可行"原话冲突      |
| -   | 8-12 周 35-65 万元预算估                                                         | ❌ 不适用 | 本项目开源 dogfood,不按外包工时 |

### 来源 3: 仓库现状评估 (2026-05-08)

> 基于 AgentILS monorepo 当前结构 (`packages/logger` 已上线,`apps/webview` 是 Vite + React,无现有 IndexedDB / adapter 抽象) 做的可行性回归。

| #   | 修订点                                                                            | 触发原因                                                                                                             | 落实位置                           |
| --- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 1   | Tier 2 激活: `?_devtools=panel` → `#__agentils_devtools__` + sessionStorage       | SPA router (Vue Router strict / React Router v6) / SSR 中转可能抹掉未识别 query;hash 纯前端可感知不污染后端          | §4.4;§6.3 用户操作脚本             |
| 2   | postMessage trace 注入加"已知盲区"                                                | 非对象型 transferable (ArrayBuffer/MessagePort/Blob) 无法挂自定义字段;MessageChannel/BroadcastChannel 不在标准拦截内 | §4.2 末尾;§10 风险表               |
| 3   | PII 入库前脱敏加"已知盲区"                                                        | ReadableStream / FormData File / WebSocket binary / opaque response 不能被读取或消费,只能记 metadata                 | §4.7 末尾;§10 风险表               |
| 4   | §3 拓扑图 Tier 1 标题加"WebView2 / Tauri / Electron / VS Code webview 不走此路径" | 防止读者误以为扩展是通用激活路径,与 §4.4 降级语义保持一致                                                            | §3 顶部图                          |
| 5   | Go helper §5 加"与 logger helper 关系"段 + §10 端口选型未决项                     | logger helper (12138) 已存在,新起 7891 二进制让用户跑两个 daemon 是次优                                              | §5 顶部;§7 仓库布局注释;§10 未决项 |

---

## 12. 参考

- Sentry browser SDK 设计: https://blog.sentry.io/wrap-javascript-functions/
- Sentry instrumentation 重构 (`addEventListener` 替代 monkey-patch): GitHub #17217
- Vue.use / zustand middleware 设计哲学
- VS Code Extension API contribution points
- WebView2 BrowserExtensions API: https://learn.microsoft.com/microsoft-edge/webview2/concepts/browser-extensions
- Chrome Local Network Access: https://developer.chrome.com/blog/local-network-access
- W3C CORS: https://fetch.spec.whatwg.org/#cors-protocol
- MDN `showSaveFilePicker`: https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker
- MDN `navigator.storage.persist`: https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist
- 中国《个人信息保护法》(PIPL) 官方解读: 国家互联网信息办公室
- GPT-5.5 Pro 调研报告: `~/Downloads/deep-research-report.md` (本仓库不收录)
- Lenovo 三仓库代码考古 (本设计依据):
    - `Lenovo/baiying-intelligent-web` (Vue3 + axios + Sentry + EventSource + WebView2 嵌入)
    - `Lenovo/smb-ui-onepcweb` (Vue2 + axios + Sentry + WebView2 host)
    - `Lenovo/smb-ui-container` (React18 + recoil + 微前端 iframe)
- 相关本仓库文档:
    - [packages/logger/README.md](../../packages/logger/README.md)
    - [docs/instructions/webview-source-of-truth.instructions.md](../instructions/webview-source-of-truth.instructions.md)
