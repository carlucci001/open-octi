import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx'])
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'])
const OUTPUT_JSON = 'docs/feature-inventory.json'
const OUTPUT_MARKDOWN = 'docs/feature-inventory.md'
const OUTPUT_CATALOG = 'docs/feature-catalog-draft.md'

function slash(value) {
  return value.split(path.sep).join('/')
}

function sortText(a, b) {
  return String(a).localeCompare(String(b), 'en', { sensitivity: 'base' })
}

function walk(directory) {
  if (!fs.existsSync(directory)) return []
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...walk(absolute))
    else files.push(absolute)
  }
  return files
}

function sourceFile(root, relativePath) {
  const absolute = path.join(root, relativePath)
  const text = fs.readFileSync(absolute, 'utf8')
  const extension = path.extname(relativePath)
  const kind = extension === '.tsx' ? ts.ScriptKind.TSX
    : extension === '.ts' ? ts.ScriptKind.TS
      : extension === '.jsx' ? ts.ScriptKind.JSX
        : ts.ScriptKind.JS
  return { absolute, text, ast: ts.createSourceFile(relativePath, text, ts.ScriptTarget.Latest, true, kind) }
}

function propertyName(node) {
  const name = node?.name
  if (!name) return ''
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  return ''
}

function staticValue(node) {
  if (!node) return undefined
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false
  if (node.kind === ts.SyntaxKind.NullKeyword) return null
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(staticValue).filter(value => value !== undefined)
  return undefined
}

function variableInitializer(ast, name) {
  let found = null
  function visit(node) {
    if (found) return
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) found = node.initializer
    else ts.forEachChild(node, visit)
  }
  visit(ast)
  return found
}

function objectRecord(node) {
  if (!ts.isObjectLiteralExpression(node)) return {}
  const record = {}
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    const name = propertyName(property)
    if (name) record[name] = staticValue(property.initializer)
  }
  return record
}

function routePath(relativeFile) {
  const parts = slash(relativeFile).split('/').slice(1, -1).filter(part => !/^\(.+\)$/.test(part))
  return `/${parts.join('/')}`.replace(/\/$/, '') || '/'
}

function exportedMethods(ast) {
  const methods = new Set()
  for (const statement of ast.statements) {
    const exported = statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
    if (exported && ts.isFunctionDeclaration(statement) && HTTP_METHODS.has(statement.name?.text)) methods.add(statement.name.text)
    if (exported && ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && HTTP_METHODS.has(declaration.name.text)) methods.add(declaration.name.text)
      }
    }
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        const name = element.name.text
        if (HTTP_METHODS.has(name)) methods.add(name)
      }
    }
  }
  return [...methods].sort(sortText)
}

function scanRoutes(root) {
  const appRoot = path.join(root, 'app')
  return walk(appRoot)
    .filter(file => SOURCE_EXTENSIONS.has(path.extname(file)) && /(?:^|[\\/])(page|route)\.(?:js|jsx|ts|tsx)$/.test(file))
    .map(file => {
      const relative = slash(path.relative(root, file))
      const kind = /\/route\./.test(relative) ? 'api' : 'page'
      const route = { kind, path: routePath(relative), file: relative }
      if (kind === 'api') route.methods = exportedMethods(sourceFile(root, relative).ast)
      return route
    })
    .sort((a, b) => sortText(`${a.kind}:${a.path}:${a.file}`, `${b.kind}:${b.path}:${b.file}`))
}

function laneForNavigation(id, label) {
  const parts = String(label).split('>').map(part => part.trim()).filter(Boolean)
  if (parts.length > 1) return { lane: parts[0], section: parts.slice(0, -1).join(' > '), screen: parts.at(-1) }
  const laneById = {
    dashboard: 'Command Center', feed: 'Command Center', leads: 'Sales', pipelines: 'Sales', accounts: 'Sales', contacts: 'Sales',
    platforms: 'Operations', projects: 'Operations', tasks: 'Operations', documents: 'Operations', media: 'Operations', switchboard: 'Operations',
    finance: 'Finance', 'campaign-studio': 'Marketing', agents: 'Agents', repository: 'Agents', notes: 'Tools', settings: 'Tools',
    'control-services': 'Tools', 'voice-guide': 'Tools', 'meeting-capture': 'Tools',
  }
  const lane = laneById[id] || 'Command Center'
  return { lane, section: lane, screen: label }
}

function scanNavigation(root) {
  const relative = 'lib/commandCenterNavigation.js'
  const { ast } = sourceFile(root, relative)
  const initializer = variableInitializer(ast, 'COMMAND_CENTER_SECTIONS')
  if (!initializer || !ts.isArrayLiteralExpression(initializer)) throw new Error('COMMAND_CENTER_SECTIONS array was not found')
  return initializer.elements
    .filter(ts.isObjectLiteralExpression)
    .map(element => {
      const values = objectRecord(element)
      const id = String(values.id || '')
      const label = String(values.label || id)
      const gatingFlags = element.properties
        .filter(property => ts.isPropertyAssignment(property) && /gate|flag|visible|enabled|condition/i.test(propertyName(property)))
        .map(property => ({ name: propertyName(property), value: staticValue(property.initializer) ?? property.initializer.getText(ast) }))
        .sort((a, b) => sortText(a.name, b.name))
      return {
        id,
        label,
        path: typeof values.path === 'string' ? values.path : `/?tab=${encodeURIComponent(id)}`,
        ...laneForNavigation(id, label),
        gated: gatingFlags.length > 0,
        gatingFlags,
      }
    })
    .filter(entry => entry.id)
    .sort((a, b) => sortText(a.id, b.id))
}

function isInside(node, ancestor) {
  for (let current = node; current; current = current.parent) if (current === ancestor) return true
  return false
}

function gateForNode(node, ast) {
  for (let current = node.parent; current && current !== ast; current = current.parent) {
    if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && isInside(node, current.right)) {
      return current.left.getText(ast).replace(/\s+/g, ' ').trim()
    }
    if (ts.isConditionalExpression(current)) return current.condition.getText(ast).replace(/\s+/g, ' ').trim()
    if (ts.isIfStatement(current)) return current.expression.getText(ast).replace(/\s+/g, ' ').trim()
  }
  return ''
}

function jsxTagName(node) {
  const tag = node.tagName
  return ts.isIdentifier(tag) ? tag.text : tag.getText()
}

function jsxAttribute(node, names) {
  const attributes = node.attributes?.properties || []
  for (const attribute of attributes) {
    if (!ts.isJsxAttribute(attribute) || !names.includes(attribute.name.text)) continue
    if (!attribute.initializer) return 'true'
    if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text
    if (ts.isJsxExpression(attribute.initializer)) {
      const value = staticValue(attribute.initializer.expression)
      if (typeof value === 'string') return value
    }
  }
  return ''
}

function jsxText(node) {
  const parts = []
  function visit(child) {
    if (ts.isJsxText(child)) parts.push(child.text)
    else if (ts.isJsxExpression(child)) {
      const value = staticValue(child.expression)
      if (typeof value === 'string') parts.push(value)
    } else ts.forEachChild(child, visit)
  }
  ts.forEachChild(node, visit)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

function cleanLabel(value) {
  const label = String(value || '').replace(/\s+/g, ' ').trim()
  if (!label || label.length > 120 || !/[A-Za-z0-9]/.test(label)) return ''
  return label
}

function tabObjectContext(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isVariableDeclaration(current)) {
      const name = current.name.getText()
      return /tab|view|mode/i.test(name)
    }
    if (ts.isPropertyAssignment(current) && /tab|view|mode/i.test(propertyName(current))) return true
    if (ts.isSourceFile(current) || ts.isFunctionLike(current)) break
  }
  return false
}

function componentScreen(relativeFile, navigation) {
  const directory = slash(relativeFile).split('/')[1] || 'command-center'
  const normalizedFile = path.basename(relativeFile).replace(/Manager\.(?:js|jsx|ts|tsx)$/i, '').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
  const match = navigation.find(entry => entry.id === directory || entry.id === normalizedFile)
  if (match) return match
  const label = directory.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
  return { id: directory, label, screen: label, lane: 'Unmapped', section: 'Unmapped' }
}

function scanControls(root, navigation) {
  const appRoot = path.join(root, 'app')
  const componentFiles = walk(appRoot).filter(file => {
    const basename = path.basename(file)
    return SOURCE_EXTENSIONS.has(path.extname(file)) && /^[A-Z].*\.(?:js|jsx|ts|tsx)$/.test(basename)
  })
  const controls = new Map()
  for (const file of componentFiles) {
    const relative = slash(path.relative(root, file))
    const { ast } = sourceFile(root, relative)
    const screen = componentScreen(relative, navigation)
    function add(type, labelValue, node) {
      const label = cleanLabel(labelValue)
      if (!label) return
      const gate = gateForNode(node, ast)
      const key = `${screen.id}\u0000${type}\u0000${label}`
      const existing = controls.get(key)
      const record = { id: crypto.createHash('sha1').update(key).digest('hex').slice(0, 12), screenId: screen.id, screen: screen.screen || screen.label, lane: screen.lane, section: screen.section, type, label, file: relative, gated: Boolean(gate) }
      if (gate) record.gate = gate
      if (!existing || (existing.gated && !record.gated) || sortText(record.file, existing.file) < 0) controls.set(key, record)
    }
    function visit(node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = jsxTagName(node)
        const role = jsxAttribute(node, ['role'])
        let type = ''
        if (role === 'tab' || /Tab$/.test(tag)) type = 'tab'
        else if (tag === 'a' || tag === 'Link') type = 'link'
        else if (tag === 'button' || /Button$/.test(tag)) type = 'button'
        if (type) {
          const parent = ts.isJsxOpeningElement(node) && ts.isJsxElement(node.parent) ? node.parent : node
          const label = jsxAttribute(node, ['aria-label', 'title', 'data-tooltip', 'label']) || jsxText(parent)
          add(type, label, node)
        }
      }
      if (ts.isObjectLiteralExpression(node) && tabObjectContext(node)) {
        const values = objectRecord(node)
        if (typeof values.label === 'string' && (values.id !== undefined || values.value !== undefined || values.key !== undefined)) add('tab', values.label, node)
      }
      ts.forEachChild(node, visit)
    }
    visit(ast)
  }
  return [...controls.values()].sort((a, b) => sortText(`${a.lane}:${a.screen}:${a.type}:${a.label}`, `${b.lane}:${b.screen}:${b.type}:${b.label}`))
}

function objectKeys(root, relative, variableName) {
  const { ast } = sourceFile(root, relative)
  const initializer = variableInitializer(ast, variableName)
  if (!initializer || !ts.isObjectLiteralExpression(initializer)) throw new Error(`${variableName} object was not found in ${relative}`)
  return initializer.properties.map(propertyName).filter(Boolean).sort(sortText)
}

export function buildInventory(root = process.cwd()) {
  const navigation = scanNavigation(root)
  return {
    schemaVersion: 1,
    routes: scanRoutes(root),
    navigation,
    controls: scanControls(root, navigation),
    agentTools: objectKeys(root, 'app/api/agent/execute/route.js', 'TOOLS').map(name => ({ name })),
    entities: objectKeys(root, 'lib/entityStore.js', 'FILES').map(name => ({ name })),
  }
}

function featureMap(inventory) {
  const map = new Map()
  for (const route of inventory.routes || []) map.set(`route:${route.kind}:${route.path}:${(route.methods || []).join(',')}`, { label: `${route.kind} ${route.path}${route.methods ? ` [${route.methods.join(', ')}]` : ''}`, gated: false })
  for (const nav of inventory.navigation || []) map.set(`navigation:${nav.id}`, { label: `navigation ${nav.label}`, gated: Boolean(nav.gated) })
  for (const control of inventory.controls || []) map.set(`control:${control.screenId}:${control.type}:${control.label}`, { label: `${control.screen} ${control.type}: ${control.label}`, gated: Boolean(control.gated) })
  for (const tool of inventory.agentTools || []) map.set(`agent-tool:${tool.name}`, { label: `agent tool ${tool.name}`, gated: false })
  for (const entity of inventory.entities || []) map.set(`entity:${entity.name}`, { label: `entity ${entity.name}`, gated: false })
  return map
}

export function diffInventories(snapshot, current) {
  const before = featureMap(snapshot)
  const after = featureMap(current)
  const added = [...after.keys()].filter(key => !before.has(key)).map(key => after.get(key).label).sort(sortText)
  const removed = [...before.keys()].filter(key => !after.has(key)).map(key => before.get(key).label).sort(sortText)
  const nowGated = [...after.keys()].filter(key => before.has(key) && !before.get(key).gated && after.get(key).gated).map(key => after.get(key).label).sort(sortText)
  return { added, removed, nowGated }
}

function renderList(title, values) {
  return [`${title}:`, ...(values.length ? values.map(value => `  - ${value}`) : ['  (none)'])]
}

export function renderDiff(diff) {
  return [...renderList('Added', diff.added), ...renderList('Removed', diff.removed), ...renderList('Now-gated', diff.nowGated)].join('\n')
}

export function renderInventoryMarkdown(inventory) {
  const lines = ['# Command Center Feature Inventory', '', 'Generated from the repository by `npm run inventory`. The snapshot is deterministic and contains no generated timestamps.', '']
  const lanes = [...new Set(inventory.navigation.map(entry => entry.lane))].sort(sortText)
  for (const lane of lanes) {
    lines.push(`## ${lane}`, '')
    for (const screen of inventory.navigation.filter(entry => entry.lane === lane).sort((a, b) => sortText(a.screen, b.screen))) {
      lines.push(`### ${screen.screen}`, '', `- Location: \`${screen.path}\``)
      if (screen.gated) lines.push(`- Gating: ${screen.gatingFlags.map(flag => `${flag.name}=${JSON.stringify(flag.value)}`).join(', ')}`)
      const controls = inventory.controls.filter(control => control.screenId === screen.id)
      lines.push('- Controls:')
      lines.push(...(controls.length ? controls.map(control => `  - ${control.type}: ${control.label}${control.gated ? ' (gated)' : ''}`) : ['  - None found by the static scan.']), '')
    }
  }
  const unmapped = inventory.controls.filter(control => !inventory.navigation.some(entry => entry.id === control.screenId))
  if (unmapped.length) {
    lines.push('## Unmapped components', '')
    for (const control of unmapped) lines.push(`- **${control.screen}** — ${control.type}: ${control.label}${control.gated ? ' (gated)' : ''}`)
    lines.push('')
  }
  lines.push('## Repository surface', '', `- Page routes: ${inventory.routes.filter(route => route.kind === 'page').length}`, `- API routes: ${inventory.routes.filter(route => route.kind === 'api').length}`, `- Registered agent tools: ${inventory.agentTools.length}`, `- Entity types: ${inventory.entities.length}`, '')
  return `${lines.join('\n')}\n`
}

function customerText(value) {
  return String(value)
    .replace(/AI-powered/gi, 'automated')
    .replace(/chatbot/gi, 'conversation')
    .replace(/assistant/gi, 'workspace')
}

const CATALOG_COPY = {
  dashboard: 'See priorities, activity, pipeline health, and operating signals in one owner-level overview.',
  feed: 'Share updates, files, photos, and operational activity across the team.',
  'api-spend': 'Track provider usage, daily spend, balances, and cost alerts.',
  leads: 'Manage the working lead database from discovery through qualification and follow-up.',
  'lead-intake': 'Review new prospects, confirm fit, and move qualified records into active sales work.',
  'email-templates': 'Maintain reusable outreach and follow-up messages for lead workflows.',
  pipelines: 'Move opportunities through defined sales stages with clear ownership and next steps.',
  accounts: 'Maintain client and company records, relationships, portal access, and account history.',
  platforms: 'Register and monitor the external products and services managed through Command Center.',
  contacts: 'Keep decision-maker details, communication history, and account relationships organized.',
  projects: 'Coordinate delivery work, milestones, status, and client-facing outcomes.',
  tasks: 'Assign, prioritize, schedule, and complete operational work.',
  finance: 'Review financial activity, billing operations, and current business totals.',
  payments: 'Record, review, and export received-payment activity.',
  invoices: 'Create and manage invoices from draft through payment.',
  overhead: 'Track recurring subscriptions, vendors, and operating costs.',
  documents: 'Create, organize, send, and manage business documents.',
  'content-lab': 'Develop campaign content and production-ready creative assets.',
  media: 'Organize images, video, audio, and reusable brand media.',
  'campaign-studio': 'Plan and run coordinated marketing work across available channels.',
  'outreach-campaigns': 'Turn selected lead lists into structured outreach work.',
  switchboard: 'Route communications and keep active conversations connected to business records.',
  agents: 'Manage the agent roster, assignments, tools, models, and operating status.',
  repository: 'Inspect source-control status, release context, and repository activity.',
  products: 'Manage the sellable service catalog, plans, subscriptions, and credits.',
  'agent-labs': 'Design, import, and test agents before operational use.',
  'agent-sandbox': 'Evaluate external agents in an isolated workspace before they receive broader access.',
  'nvidia-labs': 'Compare models, prompts, and outputs in a controlled evaluation workspace.',
  'api-lab': 'Discover, configure, and test API endpoints and payloads.',
  'voice-labs': 'Build, compare, and test voice experiences and speech models.',
  ops: 'Inspect deployments, records, and operational workflows without leaving Command Center.',
  phone: 'Place and manage business calls from the connected phone workspace.',
  conference: 'Start and coordinate multi-party calls and demonstrations.',
  calendar: 'Review availability, schedule events, and send meeting links.',
  notes: 'Search and maintain durable operating notes, playbooks, and project knowledge.',
  harness: 'Run bounded evaluations with controlled permissions and provider access.',
  network: 'Inspect service connectivity, tunnels, endpoints, and network health.',
  domains: 'Track domain registrations, DNS state, and renewal operations.',
  credentials: 'Manage approved credential references, provider connections, and usage checks.',
  settings: 'Configure Command Center preferences and administrative behavior.',
  'control-services': 'Maintain the service definitions and controls used across managed operations.',
  'voice-guide': 'Reference operating guidance, navigation help, and voice commands.',
  'meeting-capture': 'Capture conversations and turn them into searchable notes and follow-up records.',
}

export function renderCatalog(inventory) {
  const lines = ['# Command Center Feature Catalog Draft', '', 'Review draft for the master brief feature catalog. Every navigation-visible Command Center screen is represented.', '']
  const lanes = [...new Set(inventory.navigation.map(entry => entry.lane))].sort(sortText)
  for (const lane of lanes) {
    lines.push(`## ${customerText(lane)}`, '')
    for (const screen of inventory.navigation.filter(entry => entry.lane === lane).sort((a, b) => sortText(a.screen, b.screen))) {
      const description = CATALOG_COPY[screen.id] || `Manage ${customerText(screen.screen).toLowerCase()} work in a dedicated operational workspace.`
      lines.push(`- **${customerText(screen.screen)}** — ${description}`)
    }
    lines.push('')
  }
  return `${lines.join('\n')}\n`
}

function readCommittedSnapshot(root) {
  const result = spawnSync('git', ['show', `HEAD:${OUTPUT_JSON}`], { cwd: root, encoding: 'utf8', windowsHide: true })
  if (result.status === 0 && result.stdout.trim()) return JSON.parse(result.stdout)
  const disk = path.join(root, OUTPUT_JSON)
  if (fs.existsSync(disk)) return JSON.parse(fs.readFileSync(disk, 'utf8'))
  throw new Error(`No committed ${OUTPUT_JSON} snapshot exists. Run npm run inventory first.`)
}

export function writeInventory(root, inventory) {
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true })
  fs.writeFileSync(path.join(root, OUTPUT_JSON), `${JSON.stringify(inventory, null, 2)}\n`)
  fs.writeFileSync(path.join(root, OUTPUT_MARKDOWN), renderInventoryMarkdown(inventory))
  fs.writeFileSync(path.join(root, OUTPUT_CATALOG), renderCatalog(inventory))
}

async function main() {
  const rootArgument = process.argv.find(argument => argument.startsWith('--root='))
  const root = rootArgument ? path.resolve(rootArgument.slice('--root='.length)) : process.cwd()
  const current = buildInventory(root)
  if (process.argv.includes('--diff')) {
    const diff = diffInventories(readCommittedSnapshot(root), current)
    console.log(renderDiff(diff))
    if (diff.removed.length) process.exitCode = 1
    return
  }
  writeInventory(root, current)
  console.log(`Wrote ${OUTPUT_JSON}, ${OUTPUT_MARKDOWN}, and ${OUTPUT_CATALOG}.`)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) main().catch(error => {
  console.error(error.message || error)
  process.exitCode = 1
})
