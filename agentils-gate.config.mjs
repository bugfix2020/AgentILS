// AgentILS monorepo private pre-commit pipeline.
// Mirrors the three steps that used to live in
// packages/quality-gate/src/precommit/steps.ts as DEFAULT_STEPS.
// Discovered automatically by `agentils-quality-gate precommit` when run
// anywhere inside this repo (config lookup walks upward).
export default {
    steps: [
        {
            label: 'SYNC COPILOT INSTRUCTIONS',
            cmd: 'node scripts/dev/sync-agent-instructions.mjs --stage',
        },
        {
            label: 'GENERATE FLOWCHARTS',
            cmd: 'pnpm run generate:flowcharts',
        },
        {
            label: 'LINT-STAGED STAGED FILES',
            cmd: 'node scripts/dev/run-lint-staged-with-progress.mjs',
        },
    ],
}
