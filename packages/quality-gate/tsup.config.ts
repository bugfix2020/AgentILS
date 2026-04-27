import { defineConfig } from 'tsup'

export default defineConfig({
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    target: 'node20',
    outDir: 'dist',
    external: [/^node:/],
    noExternal: [/^@clack\//, 'picocolors', 'sisteransi'],
    clean: true,
    sourcemap: false,
    minify: true,
    dts: false,
    splitting: false,
    treeshake: true,
    banner: {
        js: '#!/usr/bin/env node\n// AgentILS Quality Gate CLI',
    },
})
