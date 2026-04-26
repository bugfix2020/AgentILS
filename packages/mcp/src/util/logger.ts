/**
 * MCP-local logger facade.
 *
 * Public consumers should import from `@agentils/logger`. MCP internals import
 * here so every lifecycle log is persisted through the shared HTTP JSONL
 * logger when the server is running, while still falling back to stderr during
 * early boot or external-log-server failures.
 */
import { createLogger as createStderrLogger, createHttpLogger, type Logger } from '@agentils/logger'

export {
    createChannelLogger,
    createHttpLogger,
    defaultHttpLogEndpoint,
    defaultLogDir,
    safeSerialize,
    startHttpLogServer,
} from '@agentils/logger'
export type {
    HttpLoggerOptions,
    HttpLogPayload,
    HttpLogServerHandle,
    HttpLogServerOptions,
    JsonlLogRecord,
    Level,
    Logger,
    LogSink,
} from '@agentils/logger'

const noopLogger: Logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    child: () => noopLogger,
}

export function createLogger(ns: string): Logger {
    const stderr = createStderrLogger(ns)
    const http = createHttpLogger({
        source: 'mcp',
        namespace: ns,
        fallback: noopLogger,
        defaultFields: { component: 'mcp' },
    })
    return combineLoggers(stderr, http)
}

function combineLoggers(stderr: Logger, http: Logger): Logger {
    return {
        debug: (msg, fields) => {
            stderr.debug(msg, fields)
            http.debug(msg, fields)
        },
        info: (msg, fields) => {
            stderr.info(msg, fields)
            http.info(msg, fields)
        },
        warn: (msg, fields) => {
            stderr.warn(msg, fields)
            http.warn(msg, fields)
        },
        error: (msg, fields) => {
            stderr.error(msg, fields)
            http.error(msg, fields)
        },
        child: (subNs) => combineLoggers(stderr.child(subNs), http.child(subNs)),
    }
}
