import { defineConfig } from 'tsup'

export default defineConfig({
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    target: 'node20',
    outDir: 'dist',
    external: [/^node:/, '@agent-ils/logger', '@agent-ils/mcp'],
    clean: true,
    sourcemap: true,
    dts: false,
    splitting: false,
    treeshake: true,
    banner: {
        js: '#!/usr/bin/env node\n// AgentILS CLI',
    },
})
