import fs from 'node:fs'
import path from 'node:path'

function filesBelow(root) {
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? filesBelow(path.join(root, entry.name)) : [path.join(root, entry.name)])
}
function publicKnowledge(content) {
  return String(content || '')
    .replace(/Carl Farrington(?: of Farrington Development LLC)?/gi, 'OpenOcti contributors')
    .replace(/Farrington Development LLC/gi, 'OpenOcti contributors')
}
const CLOSED_CAPABILITY_ID = /definition\(['"](?:SearchSuite3|newsroom|platforms|RemedySuite|VideoHub|WorkflowSuite|PublishingSuite|WorkflowSuite)['"]/i

export function publicFeatureManifest(content) {
  const declarations = String(content || '')
    .split(/\r?\n/)
    .filter(line => /^\s*definition\(/.test(line) && !CLOSED_CAPABILITY_ID.test(line))
  return `export const EXTERNAL_CAPABILITIES = Object.freeze([\n${declarations.join('\n')}\n])`
}
export function agentIdentityFiles(workspaceRoot) {
  return filesBelow(workspaceRoot).filter(file => path.basename(file) === 'IDENTITY.md')
}
function heading(source, content) { return `# Source: ${source}\n\n${publicKnowledge(content).trim()}\n` }
function read(root, relative) { const file = path.join(root, relative); return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '' }

function dataModel(root) {
  const lines = ['# OpenOcti data model', '', 'OpenOcti stores logical JSON documents in the SQLite `kv_store` table. The row `filename` is the logical file name; its JSON payload has the collection shown below. JSON files are seed/import/export artifacts, not a second live database.', '']
  for (const file of filesBelow(path.join(root, 'data-demo')).filter(item => item.endsWith('.json')).sort()) {
    const name = path.basename(file); const parsed = JSON.parse(fs.readFileSync(file, 'utf8')); const collections = Object.entries(parsed).filter(([, value]) => Array.isArray(value))
    const fields = [...new Set(collections.flatMap(([, rows]) => rows.slice(0, 10).flatMap(row => Object.keys(row || {}))))].sort()
    lines.push(`## ${name}`, '', `- kv_store row: \`filename='${name}'\``, `- Collections: ${collections.map(([key]) => `\`${key}\``).join(', ') || 'configuration object'}`, `- Record fields: ${fields.map(field => `\`${field}\``).join(', ') || 'varies by configuration'}`, '')
  }
  return `${lines.join('\n')}\n`
}

function environmentReference(root) {
  const output = ['# Environment reference', '', 'This lists configuration names only. It never contains saved values.', '']; let note = ''
  for (const line of read(root, '.env.example').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) { note = line.replace(/^\s*#+\s*/, '').trim(); continue }
    const match = line.match(/^([A-Z][A-Z0-9_]*)=/)
    if (match) { output.push(`- \`${match[1]}\` — ${note || 'Optional OpenOcti configuration.'}`); note = '' }
  }
  return `${output.join('\n')}\n`
}

export function generateOctiKnowledge(root) {
  const workspace = path.join(root, 'deploy/openclaw/seed/workspace/octi'); const knowledge = path.join(workspace, 'knowledge'); fs.mkdirSync(knowledge, { recursive: true })
  const model = dataModel(root); fs.mkdirSync(path.join(root, 'docs'), { recursive: true }); fs.writeFileSync(path.join(root, 'docs/DATA-MODEL.md'), model); fs.writeFileSync(path.join(knowledge, 'DATA-MODEL.md'), model)
  const docs = ['README.md', 'docs/INSTALL.md', 'docs/RELEASING.md', ...filesBelow(path.join(root, 'docs/guides')).map(file => path.relative(root, file).replaceAll('\\', '/'))].filter(relative => fs.existsSync(path.join(root, relative)))
  fs.writeFileSync(path.join(knowledge, 'PACKAGE.md'), docs.map(relative => heading(relative, read(root, relative))).join('\n'))
  fs.writeFileSync(path.join(knowledge, 'FEATURE-MANIFEST.md'), `# Feature manifest\n\nGenerated from the public capability declarations in \`lib/feature-manifest.js\` at export time. Use \`fcc_capability_status\` for live configured state.\n\n\`\`\`javascript\n${publicFeatureManifest(read(root, 'lib/feature-manifest.js')).trim()}\n\`\`\`\n`)
  fs.writeFileSync(path.join(knowledge, 'ENVIRONMENT.md'), environmentReference(root))
  const identities = agentIdentityFiles(path.join(root, 'deploy/openclaw/seed/workspace'))
  fs.writeFileSync(path.join(knowledge, 'AGENT-ROSTER.md'), `# Shipped agent roster\n\n${identities.map(file => heading(path.relative(root, file).replaceAll('\\', '/'), fs.readFileSync(file, 'utf8'))).join('\n')}`)
  return { knowledgeFiles: filesBelow(knowledge).length, docs: docs.length }
}
