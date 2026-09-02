import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const root = process.cwd()
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

describe('Command Center routing guardrails', () => {
  it('keeps top-level Command Center navigation in browser history', () => {
    const source = read('app/page.js')

    expect(source).toContain('function normalizeCommandCenterRoute(tabId, subtab)')
    expect(source).toContain('function routeFromLocation()')
    expect(source).toContain('function routeUrl(tabId, subtab)')
    expect(source).toContain('window.history[method]')
    expect(source).toContain("window.addEventListener('popstate', handler)")
    expect(source).toContain("window.addEventListener('fcc:navigate', handler)")
    expect(source).toContain('navigateRef.current = navigateToTab')
    expect(source).toContain('function navGroupFor(tabId)')
    expect(source).toContain('const group = navGroupFor(target)')
  })

  it('keeps email-templates reachable: VALID_TABS entry + tab render', () => {
    // 2026-08-14: the header button navigated to email-templates but the id
    // was missing from VALID_TABS, so the router silently fell back to the
    // dashboard. Non-sidebar destinations must still be in the allow-list.
    const source = read('app/page.js')
    expect(source).toContain("'email-templates',")
    expect(source).toContain("tab === 'email-templates' && <EmailTemplatesManager")
  })

  it('routes Finance subtabs through the shared navigation layer', () => {
    const source = read('app/finance/FinanceManager.js')

    expect(source).toContain("window.dispatchEvent(new CustomEvent('fcc:navigate'")
    expect(source).toContain("detail: { tab: 'finance', subtab: id")
    expect(source).toContain('silentHistory')
  })

  it('does not duplicate the global Repository wizard rail inside the Repository module', () => {
    const page = read('app/page.js')
    const repository = read('app/gitea/GiteaWorkspace.js')

    expect(page).not.toContain("tab !== 'repository') return\n    setSidebarCompact(true)")
    expect(repository).not.toContain('Assistant actions')
    expect(repository).not.toContain("action: 'collapse_sidebar'")
    expect(repository).not.toContain("action: 'collapse_right_rail'")
    expect(repository).toContain('repository-frame-shell')
  })
})
