// AgentILS monorepo private pre-commit pipeline.
// Mirrors the three steps that used to live in
// packages/quality-gate/src/precommit/steps.ts as DEFAULT_STEPS.
// Discovered automatically by `agentils-quality-gate precommit` when run
// anywhere inside this repo (config lookup walks upward).
//
// Note: GENERATE FLOWCHARTS was intentionally removed — the puppeteer-rendered
// PNGs are non-deterministic across machines/Chrome versions, and the
// architecture diagrams have drifted from the current code anyway. Run
// `pnpm run generate:flowcharts` manually if you want to refresh them.
export default {
    steps: [
        {
            label: 'BRANCH CHECK',
            cmd: 'node scripts/dev/check-branch-for-prd.mjs',
        },
        {
            label: 'SYNC ALL AGENT INSTRUCTIONS',
            cmd: 'node scripts/dev/sync-agent-instructions.mjs --stage',
        },
        {
            label: 'LINT-STAGED STAGED FILES',
            cmd: 'node scripts/dev/run-lint-staged-with-progress.mjs',
        },
        {
            label: 'TYPECHECK (TURBO CACHED)',
            cmd: 'pnpm -s typecheck',
        },
    ],
}
