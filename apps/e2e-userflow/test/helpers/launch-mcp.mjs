/**
 * Tiny in-test launcher that imports the public API instead of relying on
 * the broken-on-Windows `isCli` check in packages/mcp/src/index.ts.
 *
 * Usage: node test/helpers/launch-mcp.mjs
 *   - prints `port=<n>` to stdout
 *   - keeps running until killed
 */
import { startAgentilsServer } from '@agent-ils/mcp'

// Honour env overrides so #5 (cancel/timeout) can pass a tiny heartbeat
// window and an isolated state file without colliding with concurrent runs.
const statePath = process.env.AGENTILS_STATE_PATH || undefined
const heartbeatTimeoutMs = process.env.AGENTILS_HEARTBEAT_MS ? Number(process.env.AGENTILS_HEARTBEAT_MS) : undefined

const srv = await startAgentilsServer({
    http: true,
    stdio: false,
    httpPort: 0,
    statePath,
    heartbeatTimeoutMs,
})
process.stderr.write(`http bridge listening on http://127.0.0.1:${srv.http.port}\n`)
process.stdout.write(`port=${srv.http.port}\n`)
// IPC handshake for tests using `child_process.fork`
if (typeof process.send === 'function') {
    process.send({ type: 'ready', port: srv.http.port })
}

// Optional: faster sweep (default 30s in src/index.ts is too slow for
// timeout-tests). Can be tuned via AGENTILS_SWEEP_MS.
const sweepMs = process.env.AGENTILS_SWEEP_MS ? Number(process.env.AGENTILS_SWEEP_MS) : 0
let sweepTimer
if (sweepMs > 0) {
    sweepTimer = setInterval(() => {
        srv.orchestrator.sweepExpired()
    }, sweepMs)
}

const shutdown = async () => {
    if (sweepTimer) clearInterval(sweepTimer)
    await srv.stop()
    process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
