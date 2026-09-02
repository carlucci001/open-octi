import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildInventory, diffInventories, renderCatalog, renderDiff } from '../scripts/feature-inventory.mjs'

const temporaryRoots = []

function write(root, relative, content) {
  const target = path.join(root, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-inventory-'))
  temporaryRoots.push(root)
  write(root, 'lib/commandCenterNavigation.js', `
    export const COMMAND_CENTER_SECTIONS = [
      { id: 'sales', label: 'Sales', aliases: [] },
      { id: 'reports', label: 'Operations > Reports', aliases: [], featureFlag: 'reports' },
    ]
  `)
  write(root, 'lib/entityStore.js', `const FILES = { accounts: {}, tasks: {} }`)
  write(root, 'app/api/agent/execute/route.js', `
    const TOOLS = { find_client: { run() {} }, create_task: { run() {} } }
    export async function GET() {}
    export async function POST() {}
  `)
  write(root, 'app/page.js', `export default function Page() { return null }`)
  write(root, 'app/api/example/route.js', `export async function POST() {}; export { read as GET }`)
  write(root, 'app/sales/SalesManager.jsx', `
    const TABS = [{ id: 'open', label: 'Open deals' }]
    export default function SalesManager({ canDelete }) {
      return <div><button>Save lead</button><a title="Open account" href="/">icon</a>{canDelete && <button aria-label="Delete lead" />}</div>
    }
  `)
  return root
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('feature inventory', () => {
  it('enumerates routes, navigation, controls, tools, and entities deterministically', () => {
    const root = fixture()
    const inventory = buildInventory(root)

    expect(inventory.routes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'page', path: '/' }),
      expect.objectContaining({ kind: 'api', path: '/api/example', methods: ['GET', 'POST'] }),
    ]))
    expect(inventory.navigation).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'reports', lane: 'Operations', screen: 'Reports', gated: true }),
    ]))
    expect(inventory.controls).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'button', label: 'Save lead', gated: false }),
      expect.objectContaining({ type: 'button', label: 'Delete lead', gated: true }),
      expect.objectContaining({ type: 'link', label: 'Open account' }),
      expect.objectContaining({ type: 'tab', label: 'Open deals' }),
    ]))
    expect(inventory.agentTools.map(tool => tool.name)).toEqual(['create_task', 'find_client'])
    expect(inventory.entities.map(entity => entity.name)).toEqual(['accounts', 'tasks'])
    expect(buildInventory(root)).toEqual(inventory)
  })

  it('reports removed and now-gated features and makes removals blocking', () => {
    const root = fixture()
    const before = buildInventory(root)
    write(root, 'app/sales/SalesManager.jsx', `
      export default function SalesManager({ canSave }) {
        return <div>{canSave && <button>Save lead</button>}</div>
      }
    `)
    const diff = diffInventories(before, buildInventory(root))
    const output = renderDiff(diff)

    expect(diff.removed).toEqual(expect.arrayContaining([
      'Sales link: Open account',
      'Sales tab: Open deals',
      'Sales button: Delete lead',
    ]))
    expect(diff.nowGated).toEqual(['Sales button: Save lead'])
    expect(output).toContain('Removed:')
    expect(output).toContain('Now-gated:')
  })

  it('renders every navigation screen in customer-facing catalog language', () => {
    const inventory = buildInventory(fixture())
    const catalog = renderCatalog(inventory)

    expect(catalog).toContain('**Sales**')
    expect(catalog).toContain('**Reports**')
    expect(catalog).not.toMatch(/assistant|chatbot|AI-powered/i)
  })
})
