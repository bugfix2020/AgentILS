import { useMemo, useState } from 'react'
import { createBrowserLogger, type BrowserLogPayload, type BrowserLogResult } from '@agent-ils/logger/browser'

type CaseKind = 'mock' | 'live'
type CaseStatus = 'idle' | 'running' | 'pass' | 'fail'

interface CaseResult {
    status: CaseStatus
    summary: string
    evidence: string[]
}

interface RegressionCase {
    id: string
    kind: CaseKind
    title: string
    target: string
    run: (ctx: RunContext) => Promise<CaseResult>
}

interface RunContext {
    endpoint: string
}

interface MockRequest {
    url: string
    method: string
    payload?: BrowserLogPayload
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function pass(summary: string, evidence: string[] = []): CaseResult {
    return { status: 'pass', summary, evidence }
}

function fail(error: unknown, evidence: string[] = []): CaseResult {
    return {
        status: 'fail',
        summary: error instanceof Error ? error.message : String(error),
        evidence,
    }
}

function assertCase(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message)
}

function makeJsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    })
}

function makeMockFetch(options: {
    healthName: string
    logStatus?: number
    logBody?: BrowserLogResult
    onPayload?: (payload: BrowserLogPayload) => void
}): { fetchImpl: typeof fetch; requests: MockRequest[] } {
    const requests: MockRequest[] = []
    const fetchImpl: typeof fetch = async (input, init = {}) => {
        const url = String(input)
        const method = init.method ?? 'GET'
        const payload =
            typeof init.body === 'string' && init.body ? (JSON.parse(init.body) as BrowserLogPayload) : undefined
        requests.push({ url, method, payload })

        if (url.endsWith('/api/health')) {
            return makeJsonResponse({ ok: true, name: options.healthName, logDir: '/tmp/logger-regression' })
        }
        if (url.endsWith('/api/logs')) {
            if (payload) options.onPayload?.(payload)
            return makeJsonResponse(
                options.logBody ?? {
                    ok: true,
                    record: {
                        filePath: '/tmp/logger-regression/frontend.jsonl',
                        relativePath: './.agent-ils/logger/logs/frontend.jsonl',
                        line: 34,
                        location: '/tmp/logger-regression/frontend.jsonl:34',
                        relativeLocation: './.agent-ils/logger/logs/frontend.jsonl:34',
                    },
                },
                options.logStatus ?? 200,
            )
        }
        return makeJsonResponse({ ok: false, error: 'not-found' }, 404)
    }
    return { fetchImpl, requests }
}

async function runWrongHealthCase(): Promise<CaseResult> {
    const { fetchImpl, requests } = makeMockFetch({ healthName: 'other-service', logStatus: 404 })
    const logger = createBrowserLogger({
        endpoint: 'http://127.0.0.1:12138',
        source: 'frontend',
        fetchImpl,
    })

    const first = await logger.info('api.request', { url: '/api/users' })
    await wait(25)
    const second = await logger.info('api.response', { url: '/api/users', status: 200 })
    const logPosts = requests.filter((request) => request.url.endsWith('/api/logs'))

    assertCase(first.status === 204, `first call status = ${first.status}, expected 204`)
    assertCase(second.status === 204, `second call status = ${second.status}, expected 204`)
    assertCase(logPosts.length === 0, `expected zero /api/logs POSTs, got ${logPosts.length}`)

    return pass('Wrong-service health stayed unready and returned 204.', [
        `health requests: ${requests.filter((request) => request.url.endsWith('/api/health')).length}`,
        `log POSTs: ${logPosts.length}`,
    ])
}

async function runValidHealthCase(): Promise<CaseResult> {
    const { fetchImpl, requests } = makeMockFetch({ healthName: 'agentils-logger' })
    const logger = createBrowserLogger({
        endpoint: 'http://127.0.0.1:12138',
        source: 'frontend',
        fetchImpl,
    })

    const first = await logger.info('api.request', { url: '/api/users' })
    await wait(25)
    const second = await logger.info('api.response', { url: '/api/users', status: 200 })

    assertCase(first.status === 204, `first call status = ${first.status}, expected async probe 204`)
    assertCase(second.status === 200, `second call status = ${second.status}, expected 200`)
    assertCase(second.record?.relativeLocation, 'missing relativeLocation from write result')

    return pass('AgentILS health enabled browser write and returned a path:line.', [
        `first call: ${first.status}`,
        `second call: ${second.status}`,
        `location: ${second.record.relativeLocation}`,
        `log POSTs: ${requests.filter((request) => request.url.endsWith('/api/logs')).length}`,
    ])
}

async function runGroupCase(): Promise<CaseResult> {
    const payloads: BrowserLogPayload[] = []
    const { fetchImpl } = makeMockFetch({
        healthName: 'agentils-logger',
        onPayload: (payload) => payloads.push(payload),
    })
    const logger = createBrowserLogger({
        endpoint: 'http://127.0.0.1:12138',
        source: 'frontend',
        defaultFields: { screen: 'users' },
        fetchImpl,
    })

    await logger.debug('probe.start')
    await wait(25)
    await logger.group('load users', { route: '/users' })
    await logger.info('api.response', { url: '/api/users', status: 200 })
    await logger.groupEnd()

    const events = payloads.map((payload) => payload.event)
    const middle = payloads.find((payload) => payload.event === 'api.response')
    const fields = middle?.fields as Record<string, unknown> | undefined

    assertCase(events.includes('group.start'), `missing group.start in ${events.join(', ')}`)
    assertCase(events.includes('api.response'), `missing api.response in ${events.join(', ')}`)
    assertCase(events.includes('group.end'), `missing group.end in ${events.join(', ')}`)
    assertCase(fields?.group === 'load users', `group field = ${String(fields?.group)}`)
    assertCase(Array.isArray(fields.groupPath), 'groupPath is not an array')
    assertCase(fields.groupDepth === 1, `groupDepth = ${String(fields.groupDepth)}`)

    return pass('group/groupEnd emitted boundaries and injected active group context.', [
        `events: ${events.join(' -> ')}`,
        `groupPath: ${(fields.groupPath as string[]).join(' / ')}`,
    ])
}

async function runDisabledCase(): Promise<CaseResult> {
    let fetchCount = 0
    const fetchImpl: typeof fetch = async () => {
        fetchCount += 1
        return makeJsonResponse({ ok: false }, 500)
    }
    const logger = createBrowserLogger({
        endpoint: 'http://127.0.0.1:12138',
        source: 'frontend',
        enabled: false,
        fetchImpl,
    })

    const result = await logger.info('api.response', { url: '/api/users', status: 200 })
    assertCase(result.status === 204, `disabled logger status = ${result.status}, expected 204`)
    assertCase(fetchCount === 0, `disabled logger made ${fetchCount} fetch calls`)

    return pass('enabled=false returned 204 without network calls.', [`fetch calls: ${fetchCount}`])
}

async function runLiveHealthCase({ endpoint }: RunContext): Promise<CaseResult> {
    const response = await fetch(new URL('/api/health', withTrailingSlash(endpoint)))
    const body = (await response.json().catch(() => undefined)) as { ok?: unknown; name?: unknown; logDir?: unknown }

    assertCase(response.ok, `health HTTP status = ${response.status}`)
    assertCase(body?.ok === true, `health ok = ${String(body?.ok)}`)
    assertCase(body.name === 'agentils-logger', `health name = ${String(body.name)}`)

    return pass('Live collector health body matches AgentILS readiness contract.', [
        `endpoint: ${endpoint}`,
        `logDir: ${String(body.logDir)}`,
    ])
}

async function runLiveRawHttpCase({ endpoint }: RunContext): Promise<CaseResult> {
    const response = await fetch(new URL('/api/logs', withTrailingSlash(endpoint)), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            source: 'logger-regression',
            level: 'info',
            event: 'raw.http',
            message: 'raw.http',
            fileName: 'logger-regression-live.jsonl',
            fields: { mode: 'raw-http' },
        }),
    })
    const body = (await response.json()) as BrowserLogResult

    assertCase(response.ok, `raw HTTP status = ${response.status}`)
    assertCase(body.ok === true, `raw HTTP body ok = ${String(body.ok)}`)
    assertCase(body.record?.location, 'raw HTTP result missing absolute location')
    assertCase(body.record?.relativeLocation, 'raw HTTP result missing relative location')

    return pass('Raw HTTP write returned record.location and record.relativeLocation.', [
        `location: ${body.record.location}`,
        `relative: ${body.record.relativeLocation}`,
    ])
}

async function runLiveBrowserCase({ endpoint }: RunContext): Promise<CaseResult> {
    const logger = createBrowserLogger({
        endpoint,
        source: 'logger-regression',
        fileName: 'logger-regression-live.jsonl',
        defaultFields: { mode: 'browser-sdk' },
        open: true,
    })

    const first = await logger.info('browser.probe')
    await wait(75)
    const result = await logger.info('browser.location', { url: '/api/users', status: 200 })

    assertCase(result.status === 200, `browser SDK status = ${result.status}; first call was ${first.status}`)
    assertCase(result.record?.relativeLocation, 'browser SDK result missing relativeLocation')

    return pass('Live Browser SDK write returned a successful record path:line.', [
        `first call: ${first.status}`,
        `location: ${result.record.relativeLocation}`,
    ])
}

function withTrailingSlash(endpoint: string): string {
    return endpoint.endsWith('/') ? endpoint : `${endpoint}/`
}

const cases: RegressionCase[] = [
    {
        id: 'wrong-health',
        kind: 'mock',
        title: 'Wrong service health returns 204',
        target: 'Recent readiness fix: only AgentILS health may unlock /api/logs.',
        run: runWrongHealthCase,
    },
    {
        id: 'valid-health',
        kind: 'mock',
        title: 'AgentILS health returns record location',
        target: 'Browser SDK readiness and successful write result shape.',
        run: runValidHealthCase,
    },
    {
        id: 'group',
        kind: 'mock',
        title: 'group/groupEnd payload context',
        target: 'Console-like grouping emits boundaries and fields.groupPath.',
        run: runGroupCase,
    },
    {
        id: 'disabled',
        kind: 'mock',
        title: 'enabled=false no-op',
        target: 'Disabled Browser SDK calls return 204 and make no fetch calls.',
        run: runDisabledCase,
    },
    {
        id: 'live-health',
        kind: 'live',
        title: 'Live collector health contract',
        target: 'Manual check against a real local collector.',
        run: runLiveHealthCase,
    },
    {
        id: 'live-raw',
        kind: 'live',
        title: 'Live raw HTTP location',
        target: 'POST /api/logs returns absolute and relative path:line.',
        run: runLiveRawHttpCase,
    },
    {
        id: 'live-browser',
        kind: 'live',
        title: 'Live Browser SDK location',
        target: 'Browser package export writes to a running collector.',
        run: runLiveBrowserCase,
    },
]

export default function App() {
    const [endpoint, setEndpoint] = useState('http://127.0.0.1:12138')
    const [results, setResults] = useState<Record<string, CaseResult>>({})
    const [runningAll, setRunningAll] = useState(false)

    const counts = useMemo(() => {
        const values = Object.values(results)
        return {
            pass: values.filter((result) => result.status === 'pass').length,
            fail: values.filter((result) => result.status === 'fail').length,
            total: cases.length,
        }
    }, [results])

    const runCase = async (item: RegressionCase) => {
        setResults((current) => ({
            ...current,
            [item.id]: { status: 'running', summary: 'Running...', evidence: [] },
        }))
        try {
            const result = await item.run({ endpoint })
            setResults((current) => ({ ...current, [item.id]: result }))
        } catch (error) {
            setResults((current) => ({ ...current, [item.id]: fail(error) }))
        }
    }

    const runAll = async (kind: CaseKind) => {
        setRunningAll(true)
        try {
            for (const item of cases.filter((entry) => entry.kind === kind)) {
                await runCase(item)
            }
        } finally {
            setRunningAll(false)
        }
    }

    return (
        <main className="app-shell">
            <section className="header-band">
                <div>
                    <h1>AgentILS Logger Regression</h1>
                    <p>
                        A focused harness for browser readiness, `group` context, live HTTP writes, and exact log
                        locations.
                    </p>
                </div>
                <div className="scoreboard" aria-label="Regression status">
                    <span>
                        <strong>{counts.pass}</strong> pass
                    </span>
                    <span>
                        <strong>{counts.fail}</strong> fail
                    </span>
                    <span>
                        <strong>{counts.total}</strong> cases
                    </span>
                </div>
            </section>

            <section className="control-strip">
                <label>
                    Collector endpoint
                    <input
                        id="collector-endpoint"
                        name="collector-endpoint"
                        value={endpoint}
                        onChange={(event) => setEndpoint(event.target.value)}
                    />
                </label>
                <button type="button" onClick={() => void runAll('mock')} disabled={runningAll}>
                    Run mock cases
                </button>
                <button type="button" onClick={() => void runAll('live')} disabled={runningAll}>
                    Run live cases
                </button>
            </section>

            <CaseSection
                title="Mock regressions"
                description="No local collector required."
                kind="mock"
                runCase={runCase}
                results={results}
            />
            <CaseSection
                title="Live collector regressions"
                description="Start `npx @agent-ils/logger serve --cwd apps/logger-regression` first."
                kind="live"
                runCase={runCase}
                results={results}
            />
        </main>
    )
}

function CaseSection(props: {
    title: string
    description: string
    kind: CaseKind
    runCase: (item: RegressionCase) => Promise<void>
    results: Record<string, CaseResult>
}) {
    return (
        <section className="case-section">
            <div className="section-title">
                <h2>{props.title}</h2>
                <p>{props.description}</p>
            </div>
            <div className="case-grid">
                {cases
                    .filter((item) => item.kind === props.kind)
                    .map((item) => (
                        <CaseCard key={item.id} item={item} result={props.results[item.id]} runCase={props.runCase} />
                    ))}
            </div>
        </section>
    )
}

function CaseCard(props: {
    item: RegressionCase
    result?: CaseResult
    runCase: (item: RegressionCase) => Promise<void>
}) {
    const result = props.result ?? { status: 'idle', summary: 'Not run yet.', evidence: [] }
    return (
        <article className={`case-card case-card-${result.status}`}>
            <div className="case-heading">
                <div>
                    <h3>{props.item.title}</h3>
                    <p>{props.item.target}</p>
                </div>
                <span className="status-chip">{result.status}</span>
            </div>
            <p className="case-summary">{result.summary}</p>
            {result.evidence.length > 0 ? (
                <ul className="evidence-list">
                    {result.evidence.map((line) => (
                        <li key={line}>{line}</li>
                    ))}
                </ul>
            ) : null}
            <button
                type="button"
                className="case-action"
                disabled={result.status === 'running'}
                onClick={() => void props.runCase(props.item)}
            >
                Run case
            </button>
        </article>
    )
}
