import fs from 'node:fs'
import path from 'node:path'
import { editionFor } from '../lib/edition.js'
import { seedAgentKnowledge } from './openclaw/seed-knowledge.mjs'

export function nativeOpenClawStateDir(appRoot, env = process.env) {
  if (String(env.OPENCLAW_STATE_DIR || '').trim()) return path.resolve(env.OPENCLAW_STATE_DIR)
  if (String(env.OPENCLAW_CONFIG_PATH || '').trim()) return path.dirname(path.resolve(env.OPENCLAW_CONFIG_PATH))
  return path.resolve(env.CRM_DATA_DIR || path.join(appRoot, 'data'), 'openclaw')
}

export function ensureNativeOctiCcKnowledge({ appRoot = process.cwd(), env = process.env } = {}) {
  if (editionFor(env) !== 'octicc' || String(env.OPENOCTI_INSTALL_TYPE || '').toLowerCase() === 'docker') {
    return { seeded: false, reason: 'not-native-octicc' }
  }
  const stateDir = nativeOpenClawStateDir(appRoot, env)
  const workspace = path.join(stateDir, 'workspace', 'coding')
  fs.mkdirSync(workspace, { recursive: true })
  const agentsFile = path.join(workspace, 'AGENTS.md')
  if (!fs.existsSync(agentsFile)) fs.writeFileSync(agentsFile, '# Customer instructions\n')
  seedAgentKnowledge(stateDir, path.join(appRoot, 'knowledge', 'agents'), { edition: 'octicc' })
  return { seeded: true, agentId: 'coding', stateDir }
}
