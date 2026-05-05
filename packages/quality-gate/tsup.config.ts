import { defineConfig } from 'tsup'

export default defineConfig({
    entry: {
        cli: 'src/cli.ts',
        index: 'src/index.ts',
        precommit: 'src/precommit/index.tsx',
    },
    format: ['esm'],
    target: 'node20',
    outDir: 'dist',
    external: [/^node:/, 'react', 'react/jsx-runtime', 'ink'],
    noExternal: [/^@clack\//, 'picocolors', 'sisteransi'],
    clean: true,
    sourcemap: false,
    minify: false,
    dts: false,
    splitting: false,
    treeshake: true,
    jsx: 'automatic',
    esbuildOptions(options) {
        options.jsx = 'automatic'
    },
    banner: {
        js: '#!/usr/bin/env node\n// AgentILS Quality Gate CLI',
    },
})
