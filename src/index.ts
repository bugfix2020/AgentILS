// src/index.ts

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { MemoryStore } from './store/memory-store.js'
import { AuditLogger } from './audit/audit-logger.js'
import { Gateway } from './gateway/gateway.js'
import { Orchestrator } from './orchestrator/orchestrator.js'
import { registerInteractiveFeedback } from './tools/interactive-feedback.js'
import { registerApprovalTool } from './tools/approval-tool.js'
import { registerGateStatusTool } from './tools/gate-status-tool.js'
import { registerRunManagementTools } from './tools/run-management-tool.js'
import { registerAuditQueryTool } from './tools/audit-query-tool.js'
import { registerPolicyManagementTools } from './tools/policy-management-tool.js'
import { registerBudgetQueryTool } from './tools/budget-query-tool.js'

// —— 初始化存储与服务 ——
const store = new MemoryStore()
const audit = new AuditLogger(store)
const gateway = new Gateway(store, audit)
const orchestrator = new Orchestrator(store, audit)

// —— 创建 MCP Server ——
const server = new McpServer({
  name: 'agent-gate',
  version: '0.1.0',
})

// —— 注册 Tools ——
registerInteractiveFeedback(server, store)
registerApprovalTool(server)
registerGateStatusTool(server, store)
registerRunManagementTools(server, gateway, orchestrator, store)
registerAuditQueryTool(server, store)
registerPolicyManagementTools(server, store)
registerBudgetQueryTool(server, store)

// —— 启动 ——
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[agent-gate] MCP Server started on stdio')
}

main().catch((err) => {
  console.error('[agent-gate] Fatal error:', err)
  process.exit(1)
})

// 导出供外部使用
export { store, audit, gateway, orchestrator }
