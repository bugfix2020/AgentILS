import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: true,
  splitting: false,
  shims: false,
  banner: {
    js: '// agent-gate MCP Server - built with tsup',
  },
  onSuccess: 'echo "[tsup] Build complete"',
})
