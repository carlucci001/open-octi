import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

describe('Portal Marketplace truthful commerce controls', () => {
  it('does not call the legacy order endpoint or present a direct order control', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'app/portal/marketplace/page.js'), 'utf8')
    const planCard = fs.readFileSync(path.join(process.cwd(), 'app/portal/components/ConciergePlanCard.jsx'), 'utf8')
    expect(source).not.toContain("fetch('/api/portal/order'")
    expect(source).not.toContain('Order {t.name}')
    expect(source).toContain('ConciergePlanCard')
    expect(planCard).toContain('href={tier.requestHref}')
    expect(planCard).toContain("tier.commerce?.ctaLabel || 'Request plan review'")
  })

  it('keeps the upgrade page inside the audited portal request flow', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'app/portal/upgrade/page.js'), 'utf8')
    const planCard = fs.readFileSync(path.join(process.cwd(), 'app/portal/components/ConciergePlanCard.jsx'), 'utf8')
    expect(source).toContain("fetch('/api/portal/catalog')")
    expect(source).not.toContain('https://farringtondevelopment.com/lease')
    expect(source).not.toContain('within an hour')
    expect(source).toContain('ConciergePlanCard')
    expect(planCard).toContain('href={tier.requestHref}')
  })
})
