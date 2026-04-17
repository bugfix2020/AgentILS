import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface AgentILSPromptTemplate {
  name: string
  content: string
}

const promptTemplateFileNames = [
  'agentils.orchestrator.agent.md',
  'agentils.run-code.prompt.md',
  'startnewtask.prompt.md',
  'agentils.run-task.prompt.md',
  'agentils.approval.prompt.md',
  'agentils.feedback.prompt.md',
] as const

export function loadAgentILSPromptPack(extensionRootPath: string): AgentILSPromptTemplate[] {
  const templateRoot = join(extensionRootPath, 'templates')
  return promptTemplateFileNames.map((name) => ({
    name,
    content: readFileSync(join(templateRoot, name), 'utf8'),
  }))
}
