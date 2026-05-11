import { defineConfig } from 'tsup'

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        core: 'src/core/index.ts',
        react: 'src/react/index.ts',
        vue: 'src/vue/index.ts',
    },
    format: ['esm'],
    dts: {
        resolve: true,
    },
    splitting: false,
    sourcemap: true,
    clean: true,
    bundle: true,
    treeshake: true,
})
