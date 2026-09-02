import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function source(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

describe('portal card alignment system', () => {
  it('stretches Marketplace card rows and pins service actions to a shared baseline', () => {
    const css = source('app/portal/marketplace/marketplace.module.css')

    expect(css).toMatch(/\.planGrid\s*\{[^}]*grid-auto-rows:\s*1fr/s)
    expect(css).toMatch(/\.serviceGrid\s*\{[^}]*grid-auto-rows:\s*1fr/s)
    expect(css).toMatch(/\.serviceCard\s*\{[^}]*grid-template-rows:[^;]+;/s)
    expect(css).toMatch(/\.cta\s*\{[^}]*grid-row:\s*6;/s)
    expect(css).toMatch(/@media \(max-width:\s*360px\)/)
  })

  it('keeps reusable plan cards full-height with a fixed visual and bottom action row', () => {
    const css = source('app/portal/components/concierge-plan-card.module.css')

    expect(css).toMatch(/\.card\{[^}]*grid-template-rows:112px minmax\(0,1fr\)[^}]*height:100%/s)
    expect(css).toMatch(/\.action\{grid-row:7;[^}]*align-self:end/s)
    expect(css).toMatch(/@media\(max-width:360px\)/)
  })

  it('uses the same equal-height behavior in upgrade plans and responsive concierge rails', () => {
    const upgradeCss = source('app/portal/upgrade/upgrade.module.css')
    const railCss = source('app/portal/components/portal-workspace.module.css')
    const upgradePage = source('app/portal/upgrade/page.js')

    expect(upgradeCss).toMatch(/\.planGrid\s*\{[^}]*grid-auto-rows:\s*1fr/s)
    expect(upgradePage).toContain('className={styles.planGrid}')
    expect(railCss).toMatch(/\.railCards\s*\{[^}]*grid-auto-rows:\s*1fr/s)
    expect(railCss).toMatch(/\.serviceCard\s*\{[^}]*display:\s*flex;[^}]*height:\s*100%/s)
    expect(railCss).toMatch(/\.serviceLink\s*\{[^}]*margin-top:\s*auto/s)
  })
})
