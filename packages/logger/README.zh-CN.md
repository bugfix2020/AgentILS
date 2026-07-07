# AgentILS Logger

<p align="center">
  <a href="https://www.npmjs.com/package/@agent-ils/logger"><img alt="npm" src="https://img.shields.io/npm/v/@agent-ils/logger?label=npm&color=CB3837"></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white">
  <img alt="JSONL" src="https://img.shields.io/badge/logs-JSONL-7C3AED">
  <img alt="API" src="https://img.shields.io/badge/API-write%20%2B%20read-111827">
</p>

<p align="center">
  <a href="https://github.com/bugfix2020/AgentILS/blob/main/packages/logger/README.md">English</a> | 简体中文
</p>

`@agent-ils/logger` 是一个面向 AI 辅助调试的本地 JSONL 日志器。它把前端、后端、WebView、MCP 服务或脚本运行时的关键事件写入本地 JSONL 文件，再让人或 LLM Agent 按尾部条数 / 时间范围把这些原始记录读回来。

它只做两件事：写日志、读日志。它不做自动总结、不做自动根因分析、不把日志压缩成 digest。JSONL 文件就是事实来源。

它同时面向普通用户和 LLM Agent：用户只需运行一条命令启动收集器并读取尾部日志，Agent 也能把它识别为 AgentILS 标准的日志收集方式，而不是凭聊天记录瞎猜失败原因。

> 本 README 面向用户。如果你需要 LLM Agent 帮你自动化安装、写日志或读日志，请把 [`LLM_USAGE.md`](./LLM_USAGE.md) 丢给它而不是这份 README——`LLM_USAGE.md` 没有 badges、双语切换等装饰性内容，体积更小，可以显著降低 LLM 的 token 消耗。

## 使用方式

启动本地日志收集器。它会监听本地 HTTP 接口，并把日志写入目标项目的 `.agent-ils/logger/logs`。

pnpm：

```sh
pnpm dlx @agent-ils/logger
```

npm：

```sh
npx @agent-ils/logger
```

yarn：

```sh
yarn dlx @agent-ils/logger
```

bun：

```sh
bunx @agent-ils/logger
```

如果目标项目不在当前目录，可以传入 `--cwd`：

```sh
npx @agent-ils/logger --cwd packages/my-app
```

启动成功后，默认 endpoint 是：

```text
http://127.0.0.1:12138
```

默认日志目录是：

```text
.agent-ils/logger/logs
```

读取最新 50 条日志：

```sh
npx @agent-ils/logger read --tail 50
```

从某个时间点读到最新日志：

```sh
npx @agent-ils/logger read --from 2026-04-30T10:00:00Z --format json
```

读取一个固定时间段：

```sh
npx @agent-ils/logger read --from 2026-04-30T10:00:00Z --to 2026-04-30T10:10:00Z --format json
```

`--from` 和 `--to` 也支持 `10m`、`2h`、`1d` 这类相对时间：

```sh
npx @agent-ils/logger read --from 10m --format json
```

包发布前，可以在本仓库中用构建产物测试：

```sh
pnpm --filter @agent-ils/logger build
node packages/logger/dist/cli.js read --tail 50
```

`npx`、`pnpm dlx`、`yarn dlx`、`bunx` 会先运行一个很小的 Node wrapper。
这个 wrapper 必须从系统或 `~/.agent-ils/bin` 解析真正的原生
`agent-ils-logger` 二进制；它会刻意跳过 `node_modules/.bin` 下的包管理器
shim，避免递归启动自己。

## 常用命令

显式启动本地日志收集器：

```sh
npx @agent-ils/logger serve
```

指定端口和日志目录：

```sh
npx @agent-ils/logger serve --port 12138 --log-dir .agent-ils/logger/logs
```

输出机器可读的启动信息：

```sh
npx @agent-ils/logger serve --json
```

读取尾部日志：

```sh
npx @agent-ils/logger read --tail 80 --format json
```

按稳定字段过滤日志：

```sh
npx @agent-ils/logger read --tail 80 --source frontend --level warn --event api.slow --format json
```

按时间范围读取：

```sh
npx @agent-ils/logger read --from 2026-04-30T10:00:00Z --to 2026-04-30T10:10:00Z --format json
```

省略 `read` 子命令但传入读取参数时，CLI 会自动按 `read` 执行：

```sh
npx @agent-ils/logger --tail 80 --format json
```

## Agent / LLM 用法

如果你想让 LLM Agent 替你安装、启动、写日志或读日志，**不要把这份 README 丢给它**，请把 [`LLM_USAGE.md`](./LLM_USAGE.md) 丢给它——这是给 LLM 看的单页参考，token 消耗远小于本 README。

如果你的 Agent 运行时支持 skill（Claude Code、Copilot、Cursor、AgentILS 等），本包还提供一个召回用的精炼 skill：

```text
node_modules/@agent-ils/logger/dist/templates/llm/agent-ils-logger.skill.md
```

你可以这样让 LLM 自己安装这个 skill：

```text
请读取 node_modules/@agent-ils/logger/dist/templates/llm/agent-ils-logger.skill.md
（如果还没安装包，请从 npm 或 GitHub 拉取最新版），然后把它复制到你当前所在的
Agent 运行时（Codex、Claude Code、Copilot、Cursor、AgentILS 等）的 skill /
instruction 目录里。你知道自己运行在哪个环境上，必要时请查阅该环境的官方文档
确认目录约定。不要凭空猜路径，不确定就先问我。
```

这是有意设计：让运行时的 LLM 自己决定安装位置，包不维护脆弱的 IDE→目录对照表。

## CLI 参数

```text
Usage:
  agent-ils-logger serve [options]
  agent-ils-logger read  [options]

Options for serve:
  --cwd <dir>            项目根目录，默认当前目录
  --host <host>          收集器 host，默认 127.0.0.1
  --port <port>          收集器端口，默认 12138
  --log-dir <dir>        JSONL 日志目录，默认 .agent-ils/logger/logs
  --file-prefix <name>   默认 JSONL 文件名前缀，默认 agent-ils
  --json                 输出机器可读的启动信息
  --silent               减少启动输出

Options for read:
  --cwd <dir>            项目根目录，默认当前目录
  --log-dir <dir>        要扫描的 JSONL 日志目录，默认 .agent-ils/logger/logs
  --tail <n>             读取尾部 n 条记录，默认 50
  --from <time>          开始时间：ISO 时间、epoch ms，或 10m / 2h / 1d 这类相对时间
  --to <time>            结束时间；省略时表示从 --from 读到最新记录
  --source <source>      按 source 字段过滤
  --level <level>        按 level 字段过滤，大小写不敏感
  --event <event>        按 event 字段过滤
  --format <format>      text、json 或 jsonl，默认 text
```

## 日志记录结构

每条 JSONL 记录都尽量保持可读、可检索、可被 AI 直接引用。典型记录如下：

```json
{
    "ts": "2026-04-30T10:00:00.000Z",
    "seq": 1,
    "pid": 12345,
    "source": "frontend",
    "namespace": "frontend",
    "level": "info",
    "event": "api.response",
    "message": "GET /api/users returned 200",
    "fields": {
        "url": "/api/users",
        "status": 200,
        "empty": true
    },
    "traceId": "user-list-001",
    "fileName": "frontend-2026-04-30.jsonl",
    "filePath": "/Users/me/project/.agent-ils/logger/logs/frontend-2026-04-30.jsonl",
    "relativePath": "./.agent-ils/logger/logs/frontend-2026-04-30.jsonl",
    "line": 34,
    "location": "/Users/me/project/.agent-ils/logger/logs/frontend-2026-04-30.jsonl:34",
    "relativeLocation": "./.agent-ils/logger/logs/frontend-2026-04-30.jsonl:34"
}
```

写入成功后，HTTP 返回体会带上实际写入的 `record`。工具需要稳定打开文件时用
`record.location`（绝对 `path:line`）；展示给人或 LLM 时优先用
`record.relativeLocation`，更短也更符合仓库上下文。读取日志时也会带上这些字段；
旧 JSONL 没有存这些字段时，读取逻辑会用当前文件路径和物理行号补齐。

推荐写入字段：

- `source`：日志来源，例如 `frontend`、`backend`、`webview`、`mcp`
- `event`：稳定事件名，例如 `api.request`、`api.response`、`ui.click`
- `traceId`：串起一次用户操作、请求链路或工具调用
- `url` / `method` / `status`：接口排查最常用字段
- `params` / `body` / `empty`：判断请求参数和返回内容是否符合预期
- `costMs`：排查慢请求或超时
- `error`：错误名称、错误消息，必要时含 stack

## Browser SDK

`@agent-ils/logger/browser` 是浏览器安全的写日志方法，会通过 `fetch` 投递到本地收集器。

```ts
import { createBrowserLogger } from '@agent-ils/logger/browser'

const logger = createBrowserLogger({
    endpoint: 'http://127.0.0.1:12138',
    source: 'frontend',
    defaultFields: { app: 'agentils-webview' },
})

await logger.debug('state.transition', { from: 'idle', to: 'loading' })
const result = await logger.info('api.response', { url: '/api/users', status: 200 }, { traceId: 'user-list-001' })
if (result.record) console.log(result.record.relativeLocation ?? result.record.location)
await logger.warn('api.slow', { url: '/api/users', costMs: 3500 })
await logger.error('api.error', { url: '/api/users', message: 'timeout' })
```

可以用 `group` / `groupEnd` 把相关日志圈成一组，语义类似 `console.group`：

```ts
const trace = { traceId: 'user-list-001' }
await logger.group('load users', { screen: 'users' }, trace)
await logger.info('api.request', { url: '/api/users' }, trace)
await logger.info('api.response', { url: '/api/users', status: 200 }, trace)
await logger.groupEnd(undefined, trace)
```

组内日志会在 `fields` 里自动带上 `group`、`groupPath`、`groupDepth`。
`group()` 会写一条 `group.start` 记录，`groupEnd()` 会写一条 `group.end` 记录。

可以用 `child` 复用上下文字段：

```ts
const taskLogger = logger.child({ page: 'users' })

await taskLogger.info('ui.click', { button: 'refresh' })
await taskLogger.info('api.request', { url: '/api/users' })
```

常用配置：

- `endpoint`：本地收集器地址
- `source`：当前 writer 的日志来源
- `defaultFields`：每条日志都会带上的字段
- `traceId`：默认顶层 trace id。浏览器端如果要按单次调用设置顶层 trace id，请把 `{ traceId }` 作为第三个参数传入；`defaultFields.traceId` 只会留在 `fields` 内
- `filePrefix`：JSONL 文件名前缀
- `fileName`：指定 JSONL 文件名
- `enabled`：关闭投递但保留调用点
- `overrideKey`：当配置值与 `window.$agentILS.logger.overrideKey` 匹配时，即使 `enabled: false` 也强制记录日志。SSR 环境下 `window` 不可用时不生效，直接走 `enabled` 原逻辑
- `timeoutMs`：每次写日志请求的超时时间
- `onDeliveryError`：写入失败时的回调
- `open`：为 `true` 时构造 logger 后立即启动健康探测，并在 Node 环境自动拉起 collector

**写入结果**：浏览器端成功写入时返回 `{ ok: true, status: 200, record }`。如果投递被关闭或 collector 尚未就绪，会返回 `{ ok: true, status: 204 }`；此时没有写入 JSONL，`record` 也不存在。发送失败时返回 `{ ok: false, error }`。

**Collector 就绪检测**：Browser SDK 会在后台每 10 秒探测 `GET /api/health`，与 `log()` 调用解耦。只有健康响应 JSON 包含 `{ "ok": true, "name": "agentils-logger" }` 时才算就绪；同端口上其它服务即使返回 2xx，也会被当作未就绪。collector 未就绪时 `log()` 立即返回 `{ ok: true, status: 204 }`，不会请求 `/api/logs`，因此不会产生 CONNECTION_REFUSED 或误打到其它服务的 404 噪音；发送失败会重置就绪状态并继续后台探测。传入 `open: true` 可以在构造时就开始探测，并在 Node 环境自动拉起 collector。首次健康探测是异步的；如果第一条浏览器日志就必须拿到 `record`，请先启动 collector 或先确认 `/api/health` 的 JSON body 正确。

**环境变量行为**：Browser SDK 不读取 `AGENTILS_DEBUG`、`AGENTILS_LOG_URL` 或 `AGENTILS_LOG_DIR`；浏览器端请显式传 `enabled`、`endpoint` 和 `open`。`createLogger()` / `createChannelLogger()` 会用 `AGENTILS_DEBUG` 过滤 `debug` / `info`（`warn` / `error` 始终写出）。`createHttpLogger()` 默认 endpoint 来自 `AGENTILS_LOG_URL`，并且只有设置 `respectDebugEnv: true` 时才尊重 `AGENTILS_DEBUG`。`AGENTILS_LOG_DIR` 只影响 Node `defaultLogDir()` / `startHttpLogServer()` 默认值；原生 Go CLI 使用 `--cwd` 和 `--log-dir`。

**日志目录 `.gitignore`**：collector 会在日志目录自动创建内容为 `*` 的 `.gitignore`，避免日志文件被误提交。

## Node 写入 API

包根入口提供 Node 端的 logger helper，可用于 Node 进程、MCP server 或 VS Code extension host：

```ts
import { createHttpLogger, createLogger } from '@agent-ils/logger'

const stderrLogger = createLogger('mcp')
stderrLogger.warn('tool failed', { toolName: 'request_user_clarification' })

const httpLogger = createHttpLogger({
    source: 'mcp',
    endpoint: 'http://127.0.0.1:12138',
    traceId: 'feedback-001',
    defaultFields: { component: 'mcp' },
})

httpLogger.group('feedback flow')
httpLogger.info('interaction.submitted', { toolName: 'request_user_feedback', textLen: 42 })
httpLogger.groupEnd()
```

Node HTTP 日志中，`traceId` 选项会设置默认顶层 trace id；单次调用的
`fields.traceId` 会覆盖它。`defaultFields.traceId` 只保留在 `fields` 内。

`createHttpLogger()` 是 fire-and-forget：它的方法返回 `void`，不会把 collector
响应体直接暴露给调用方。如果调用方需要马上拿到写入结果，请使用 Browser SDK
或 raw HTTP API；也可以之后用 `@agent-ils/logger/query` 把 JSONL 读回来。

## HTTP 写入 API

不使用 SDK 时，也可以直接写 HTTP：

```sh
curl -X POST http://127.0.0.1:12138/api/logs \
  -H 'content-type: application/json' \
  -d '{
    "source": "frontend",
    "level": "info",
    "event": "api.response",
    "message": "GET /api/users returned 200",
    "fields": { "url": "/api/users", "status": 200, "empty": true },
    "traceId": "user-list-001",
    "filePrefix": "frontend"
  }'
```

`POST /api/logs` 支持单条 payload，也支持 payload 数组。

单条 payload 成功时返回：

```json
{
    "ok": true,
    "record": {
        "event": "api.response",
        "filePath": "/Users/me/project/.agent-ils/logger/logs/frontend-2026-04-30.jsonl",
        "relativePath": "./.agent-ils/logger/logs/frontend-2026-04-30.jsonl",
        "line": 34,
        "location": "/Users/me/project/.agent-ils/logger/logs/frontend-2026-04-30.jsonl:34",
        "relativeLocation": "./.agent-ils/logger/logs/frontend-2026-04-30.jsonl:34"
    }
}
```

数组 payload 成功时返回 `{ "ok": true, "records": [...] }`。

健康检查：

```sh
curl http://127.0.0.1:12138/api/health
```

有效的 collector 健康响应类似：

```json
{ "ok": true, "name": "agentils-logger", "logDir": "/abs/project/.agent-ils/logger/logs" }
```

## 读取 API

如果要在自己的 UI、脚本或 Ink 面板里复用读取逻辑，可以使用 `@agent-ils/logger/query`：

```ts
import { formatLogRecords, readLogRecords } from '@agent-ils/logger/query'

const records = await readLogRecords({
    tail: 80,
    from: '2026-04-30T10:00:00Z',
})

console.log(formatLogRecords(records, 'json'))
```

读取参数与 CLI 保持一致：`tail`、`from`、`to`、`format`。程序化 formatter
额外支持 `markdown`；Go CLI 支持 `text`、`json`、`jsonl`。

## 不做什么

`@agent-ils/logger` 故意不做这些事：

- 不做自动 digest
- 不做自动根因分析
- 不做日志数据库
- 不提供复杂查询语言
- 不替人或 AI 下结论

它是观察工具，不是判断工具。
