import { defineConfig } from 'tsup'

export default defineConfig({
    entry: { index: 'src/index.ts', browser: 'src/browser.ts', cli: 'src/cli.ts', query: 'src/query.ts' },
    format: ['esm', 'cjs'],
    target: 'node20',
    dts: true,
    clean: true,
    sourcemap: false,
    splitting: false,
})
