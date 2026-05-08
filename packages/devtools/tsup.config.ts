import { defineConfig } from 'tsup'

export default defineConfig({
    entry: { index: 'src/index.ts', auto: 'src/auto.ts' },
    format: ['esm', 'cjs'],
    target: 'es2022',
    platform: 'browser',
    dts: true,
    clean: true,
    sourcemap: false,
    splitting: false,
})
