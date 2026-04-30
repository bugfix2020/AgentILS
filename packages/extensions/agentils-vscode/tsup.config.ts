import { defineConfig } from 'tsup'

export default defineConfig({
    entry: { extension: 'src/extension.ts' },
    format: ['cjs'],
    outExtension: () => ({ js: '.cjs' }),
    target: 'node20',
    outDir: 'dist',
    external: ['vscode'],
    noExternal: ['@agent-ils/mcp'],
    clean: true,
    sourcemap: true,
    dts: false,
    splitting: false,
    treeshake: true,
})
