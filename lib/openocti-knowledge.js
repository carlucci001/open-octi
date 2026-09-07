import fs from 'node:fs'
import path from 'node:path'

export const KNOWLEDGE_AGENT_IDS = ['main', 'coding', 'social-media', 'legal', 'matilda']

export function readOpenOctiAgentKnowledge(agentId, root = path.join(process.cwd(), 'knowledge', 'agents')) {
  if (!KNOWLEDGE_AGENT_IDS.includes(agentId)) return ''
  return [agentId + '.md', agentId + '.voice.md'].map(name => {
    const file = path.join(root, name)
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  }).filter(Boolean).join('\n\n')
}
