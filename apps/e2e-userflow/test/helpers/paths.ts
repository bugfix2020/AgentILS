/**
 * Path constants — locate the built CLI / MCP entry points by walking up to
 * the monorepo root from this file.
 */
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..')
export const MCP_DIST = join(REPO_ROOT, 'packages', 'mcp', 'dist', 'index.js')
export const CLI_DIST = join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.js')
export const TEMPLATES_DIR = join(REPO_ROOT, 'packages', 'cli', 'templates')
