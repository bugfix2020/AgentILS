#!/bin/bash
# agent-gate 诊断脚本 — 自动检查 MCP Server 配置和运行状态
set -euo pipefail
cd "$(dirname "$0")/.."

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }

echo "=============================="
echo " agent-gate 诊断报告"
echo "=============================="
echo ""

# 1. 检查 dist/index.js 是否存在
echo "--- 构建产物 ---"
if [ -f dist/index.js ]; then
  pass "dist/index.js 存在"
else
  fail "dist/index.js 不存在 — 请运行 npx tsc"
fi

# 2. 检查 Node.js 版本
echo ""
echo "--- Node.js ---"
NODE_VER=$(node -v 2>/dev/null || echo "N/A")
echo "  版本: $NODE_VER"
if [[ "$NODE_VER" == v2* ]] || [[ "$NODE_VER" == v22* ]]; then
  pass "Node.js >= 22"
else
  warn "建议 Node.js >= 22（当前 $NODE_VER）"
fi

# 3. 检查 mcp.json（本项目）
echo ""
echo "--- mcp.json (agent-gate/.vscode/) ---"
MCP_LOCAL=".vscode/mcp.json"
if [ -f "$MCP_LOCAL" ]; then
  pass "$MCP_LOCAL 存在"
  if grep -q '"servers"' "$MCP_LOCAL"; then
    pass "使用 \"servers\" 键名（正确）"
  elif grep -q '"mcpServers"' "$MCP_LOCAL"; then
    fail "使用了 \"mcpServers\" 键名 — VS Code 要求 \"servers\""
  else
    warn "格式不明，请手动检查"
  fi
  if grep -q '"type"' "$MCP_LOCAL"; then
    pass "包含 \"type\" 字段"
  else
    fail "缺少 \"type\": \"stdio\" 字段"
  fi
else
  warn "$MCP_LOCAL 不存在（如果在 monorepo 根目录配置则正常）"
fi

# 4. 检查 mcp.json（工作区根目录）
echo ""
echo "--- mcp.json (workspace root) ---"
MCP_ROOT="../.vscode/mcp.json"
if [ -f "$MCP_ROOT" ]; then
  pass "$MCP_ROOT 存在"
  if grep -q '"servers"' "$MCP_ROOT"; then
    pass "使用 \"servers\" 键名"
  else
    fail "键名错误"
  fi
else
  warn "工作区根 .vscode/mcp.json 不存在"
fi

# 5. 检查 copilot-instructions.md
echo ""
echo "--- copilot-instructions.md ---"
INSTRUCTIONS=".github/copilot-instructions.md"
if [ -f "$INSTRUCTIONS" ]; then
  pass "$INSTRUCTIONS 存在"
  if grep -q "interactive_feedback" "$INSTRUCTIONS"; then
    pass "包含 interactive_feedback 循环规则"
  else
    warn "未找到 interactive_feedback 相关规则"
  fi
  if grep -q "FEEDBACK_DONE" "$INSTRUCTIONS"; then
    pass "包含 FEEDBACK_DONE 终止条件"
  else
    warn "未找到 FEEDBACK_DONE 终止条件说明"
  fi
else
  fail "$INSTRUCTIONS 不存在"
fi

# 6. 试启动
echo ""
echo "--- 启动测试（3秒超时）---"
timeout 3 node dist/index.js 2>/tmp/agent-gate-diag-stderr.log </dev/null >/dev/null || true
if [ -f /tmp/agent-gate-diag-stderr.log ]; then
  STDERR_CONTENT=$(cat /tmp/agent-gate-diag-stderr.log)
  if [ -z "$STDERR_CONTENT" ]; then
    pass "启动无错误输出"
  else
    warn "stderr 输出："
    echo "$STDERR_CONTENT" | head -20
  fi
  rm -f /tmp/agent-gate-diag-stderr.log
fi

# 7. 检查工具注册
echo ""
echo "--- 工具注册 ---"
TOOL_COUNT=$(grep -r "registerTool" src/tools/*.ts 2>/dev/null | wc -l | tr -d ' ')
echo "  共 $TOOL_COUNT 个 registerTool 调用"
grep -r "registerTool" src/tools/*.ts 2>/dev/null | sed "s/.*registerTool('/  - /" | sed "s/'.*//" || true

echo ""
echo "=============================="
echo " 诊断完成"
echo "=============================="
