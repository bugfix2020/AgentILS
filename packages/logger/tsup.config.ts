import { defineConfig } from 'tsup'

export default defineConfig({
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs', 'cjs'],
    target: 'node20',
    dts: true,
    clean: true,
    sourcemap: true,
    splitting: false,
})
