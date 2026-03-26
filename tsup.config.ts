import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'interaction/index': 'src/interaction/interaction-loop.ts',
    'interaction/sampling': 'src/interaction/sampling-client.ts',
    'interaction/channel-mcp': 'src/interaction/channel-mcp.ts',
    'interaction/channel-hc': 'src/interaction/channel-hc.ts',
    'gateway/index': 'src/gateway/gateway.ts',
    'orchestrator/index': 'src/orchestrator/orchestrator.ts',
    'store/index': 'src/store/memory-store.ts',
    'audit/index': 'src/audit/audit-logger.ts',
    'budget/index': 'src/budget/budget-checker.ts',
    'policy/index': 'src/policy/tool-policy-checker.ts',
    'config/index': 'src/config/defaults.ts',
    'types/index': 'src/types/index.ts',
  },
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: true,
  splitting: true,
  treeshake: true,
  minify: true,
  banner: {
    js: '// agent-gate MCP Server',
  },
  onSuccess: 'echo "[tsup] Build complete"',
})
