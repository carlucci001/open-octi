import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const agentIds = ['main', 'coding', 'social-media', 'legal', 'matilda']
const begin = '<!-- OPENOCTI AUTHORED KNOWLEDGE -->'
const end = '<!-- END OPENOCTI AUTHORED KNOWLEDGE -->'

function adaptKnowledgeForEdition(content, edition) {
  return edition === 'octicc' ? content.replace(/\bOpenOcti\b/g, 'OctiCC') : content
}

export function seedAgentKnowledge(stateDir, knowledgeRoot, { edition = process.env.FCC_EDITION || 'openocti' } = {}) {
  const selectedAgentIds = edition === 'octicc' ? ['coding'] : agentIds
  for (const id of selectedAgentIds) {
    const workspace = path.join(stateDir, 'workspace', id)
    if (!fs.existsSync(workspace)) continue
    const target = path.join(workspace, 'knowledge')
    fs.mkdirSync(target, { recursive: true })
    const content = []
    for (const suffix of ['.md', '.voice.md']) {
      const source = path.join(knowledgeRoot, id + suffix)
      if (!fs.existsSync(source)) throw new Error(`Missing packaged agent knowledge: ${id}${suffix}`)
      const destination = path.join(target, id + suffix)
      const packaged = adaptKnowledgeForEdition(fs.readFileSync(source, 'utf8'), edition)
      try { fs.writeFileSync(destination, packaged, { flag: 'wx' }) }
      catch (error) { if (error.code !== 'EEXIST') throw error }
      content.push(fs.readFileSync(destination, 'utf8'))
    }
    const agentsFile = path.join(workspace, 'AGENTS.md')
    const original = fs.existsSync(agentsFile) ? fs.readFileSync(agentsFile, 'utf8') : ''
    // Keep owner-authored instructions outside the package's explicitly marked block.
    const start = original.indexOf(begin), finish = original.indexOf(end)
    const base = start >= 0 && finish >= start ? original.slice(0, start) + original.slice(finish + end.length) : original
    fs.writeFileSync(agentsFile, base.trimEnd() + '\n\n' + begin + '\n' + content.join('\n\n') + '\n' + end + '\n')
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  seedAgentKnowledge(process.argv[2], process.argv[3], { edition: process.env.FCC_EDITION || 'openocti' })
}
