# AgentILS Logger

<p align="center">
  <a href="https://www.npmjs.com/package/@agent-ils/logger"><img alt="npm" src="https://img.shields.io/npm/v/@agent-ils/logger?label=npm&color=CB3837"></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white">
  <img alt="JSONL" src="https://img.shields.io/badge/logs-JSONL-7C3AED">
  <img alt="API" src="https://img.shields.io/badge/API-write%20%2B%20read-111827">
</p>

<p align="center">简体中文</p>

`@agent-ils/logger` 是一个面向 AI 辅助调试的本地 JSONL 日志器，用于把前端、后端、WebView、MCP 或脚本运行时发生的关键事件写入本地日志文件，再让人或 AI 按尾部条数、起止时间范围读取这些原始记录。

它的核心职责只有两个：写日志、读日志。它不做自动总结、不做自动根因分析、不把日志压缩成 digest；JSONL 文件就是事实来源。

## 使用方式

先启动本地日志收集器。它会监听 HTTP 写入接口，并把日志写入当前项目的 `.agent-ils/logger/logs`：

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

在浏览器代码中写入日志：

```ts
import { createBrowserLogger } from '@agent-ils/logger/browser'

const logger = createBrowserLogger({
    endpoint: 'http://127.0.0.1:12138',
    source: 'frontend',
    filePrefix: 'frontend',
})

await logger.info(
    'api.response',
    {
        url: '/api/users',
        status: 200,
        empty: true,
    },
    {
        traceId: 'user-list-001',
    },
)
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

包发布前，可以在本仓库中用构建产物测试：

```sh
pnpm --filter @agent-ils/logger build
node packages/logger/dist/cli.js read --tail 50
```

## 常用命令

启动本地日志收集器：

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

按时间范围读取日志：

```sh
npx @agent-ils/logger read --from 2026-04-30T10:00:00Z --to 2026-04-30T10:10:00Z --format json
```

没有写 `read` 子命令但传入读取参数时，CLI 会自动按 `read` 执行：

```sh
npx @agent-ils/logger --tail 80 --format json
```

## Agent / LLM 用法

当用户要求 LLM Agent 排查前端请求、后端接口、WebView、MCP 工具调用或脚本运行问题时，Agent 应优先使用这个包读取运行时日志，而不是直接猜原因。

用户可以这样说：

```text
帮我排查用户列表接口为什么返回空，先读 @agent-ils/logger 的日志，不要先猜。
```

推荐 Agent 行为：

- 第一轮先读取尾部日志，例如 `npx @agent-ils/logger read --tail 80 --format json`。
- 如果看到相关记录，再根据 `ts` 用 `--from` 和 `--to` 缩小时间范围。
- 如果日志里有 `traceId`，围绕同一个 `traceId` 串起一次用户操作或请求链路。
- 只根据读到的 JSONL 事实继续判断下一步，不把 logger 当成自动诊断工具。
- 最后结论应引用日志里的 `source`、`event`、`traceId`、`url`、`status`、`fields` 等字段。

例如：

```text
第一轮：读取最近 80 条日志，确认是否有用户列表请求。
命令：npx @agent-ils/logger read --tail 80 --format json
观察：看到 source=frontend，event=api.response，url=/api/users，status=200，empty=true，traceId=user-list-001。

第二轮：围绕这个时间点继续缩小范围。
命令：npx @agent-ils/logger read --from 2026-04-30T10:03:00Z --to 2026-04-30T10:04:00Z --format json
观察：看到 event=api.request 的 fields.params.orgId 为空。

结论：接口本身没有报错，前端发起请求时缺少 orgId，后端按空 org 返回了空数组。
```

## CLI 参数

```text
Usage:
  agent-ils-logger serve [options]
  agent-ils-logger read [options]

Options for serve:
  --cwd <dir>            项目根目录，默认当前目录
  --host <host>          本地日志收集器 host，默认 127.0.0.1
  --port <port>          本地日志收集器端口，默认 12138
  --log-dir <dir>        JSONL 日志目录，默认 .agent-ils/logger/logs
  --file-prefix <name>   默认 JSONL 文件名前缀，默认 agent-ils
  --json                 输出机器可读启动信息
  --silent               减少启动输出

Options for read:
  --cwd <dir>            项目根目录，默认当前目录
  --log-dir <dir>        要扫描的 JSONL 日志目录，默认 .agent-ils/logger/logs
  --tail <n>             读取尾部 n 条记录，默认 50
  --from <time>          开始时间，支持 ISO 时间、epoch ms 或 10m 这类相对时间
  --to <time>            结束时间；省略时表示从 --from 读到最新记录
  --format <format>      输出 text、json、jsonl 或 markdown，默认 text
```

`--from` 和 `--to` 支持 ISO 时间、epoch ms，也支持 `10m`、`2h`、`1d` 这类相对当前时间的写法。

## 写入内容

每条 JSONL 记录会尽量保持可读、可检索、可被 AI 直接引用。典型记录如下：

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
    "fileName": "frontend-2026-04-30.jsonl"
}
```

推荐写入字段：

- `source`：日志来源，例如 `frontend`、`backend`、`webview`、`mcp`
- `event`：稳定事件名，例如 `api.request`、`api.response`、`ui.click`
- `traceId`：串起一次用户操作、请求链路或工具调用
- `url` / `method` / `status`：接口排查最常用字段
- `params` / `body` / `empty`：判断请求参数和返回内容是否符合预期
- `costMs`：排查慢请求或超时
- `error`：错误名称、错误消息、必要时包含 stack

## Browser SDK

`@agent-ils/logger/browser` 提供浏览器安全的写日志方法，会通过 `fetch` 写入本地日志收集器。

```ts
import { createBrowserLogger } from '@agent-ils/logger/browser'

const logger = createBrowserLogger({
    endpoint: 'http://127.0.0.1:12138',
    source: 'frontend',
    defaultFields: {
        app: 'agentils-webview',
    },
})

await logger.debug('state.transition', { from: 'idle', to: 'loading' })
await logger.info('api.response', { url: '/api/users', status: 200 })
await logger.warn('api.slow', { url: '/api/users', costMs: 3500 })
await logger.error('api.error', { url: '/api/users', message: 'timeout' })
```

可以用 `child` 复用上下文字段：

```ts
const taskLogger = logger.child({
    traceId: 'task-001',
    page: 'users',
})

await taskLogger.info('ui.click', { button: 'refresh' })
await taskLogger.info('api.request', { url: '/api/users' })
```

常用配置：

- `endpoint`：本地日志服务地址
- `source`：当前日志来源
- `defaultFields`：每条日志都会带上的字段
- `traceId`：默认 trace id
- `filePrefix`：JSONL 文件名前缀
- `fileName`：指定 JSONL 文件名
- `enabled`：关闭投递但保留调用点
- `timeoutMs`：写日志请求超时时间
- `onDeliveryError`：写入失败时的回调

## HTTP 写入 API

不使用 Browser SDK 时，也可以直接写 HTTP：

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

健康检查：

```sh
curl http://127.0.0.1:12138/api/health
```

## Node 写入 API

包根入口保留了 Node logger helper，可用于 Node 进程、MCP server 或 VS Code extension host：

```ts
import { createHttpLogger, createLogger } from '@agent-ils/logger'

const stderrLogger = createLogger('mcp')
stderrLogger.warn('tool failed', { toolName: 'run_task' })

const httpLogger = createHttpLogger({
    source: 'mcp',
    endpoint: 'http://127.0.0.1:12138',
})

httpLogger.info('run_task_loop.next', {
    action: 'await_webview',
})
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

读取参数和 CLI 保持一致：`tail`、`from`、`to`、`format`。

## 不做什么

`@agent-ils/logger` 故意不做这些事：

- 不做自动 digest
- 不做自动根因分析
- 不做日志数据库
- 不提供复杂查询语言
- 不替人或 AI 下结论

它是观察工具，不是判断工具。

## 开发

```sh
pnpm --filter @agent-ils/logger typecheck
pnpm --filter @agent-ils/logger build
```
