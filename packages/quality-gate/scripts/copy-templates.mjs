import { cp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageRoot = join(__dirname, '..')
const source = join(packageRoot, 'templates')
const target = join(packageRoot, 'dist', 'templates')

await rm(target, { recursive: true, force: true })
await cp(source, target, { recursive: true })
