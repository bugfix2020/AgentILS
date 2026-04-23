import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'client/index': 'src/client/index.ts',
    'types/index': 'src/types/index.ts',
  },
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  external: [/^node:/, 'express', '@modelcontextprotocol/sdk', 'zod'],
  clean: true,
  sourcemap: true,
  dts: true,
  splitting: true,
  treeshake: true,
  minify: false,
  banner: {
    js: '#!/usr/bin/env node\n// AgentILS MCP Server',
  },
})
