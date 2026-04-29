import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  external: [/^node:/, '@agentils/mcp'],
  clean: true,
  sourcemap: true,
  dts: true,
  splitting: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
})
