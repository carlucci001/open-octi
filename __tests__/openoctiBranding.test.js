import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const overlayRoot = path.join(root, 'openocti')

describe('OpenOcti repository home and guides', () => {
  it('ships the branded 1280 by 360 banner and source logo', () => {
    const banner = fs.readFileSync(path.join(overlayRoot, 'docs/brand/banner.svg'), 'utf8')
    expect(banner).toContain('width="1280" height="360"')
    expect(banner).toContain('#001040')
    expect(banner).toContain('#000010')
    expect(banner).toContain('#30c0f0')
    expect(banner).toContain('#0070d0')
    expect(banner).toContain('#8ba0c4')
    expect(banner).toContain('Space Grotesk')
    expect(banner).toContain('the open-source Command Center')
    expect(fs.statSync(path.join(overlayRoot, 'docs/brand/octopus-mark.png')).size).toBeGreaterThan(1000)
  })

  it('covers the release story and has no broken relative image or guide links', () => {
    const readme = fs.readFileSync(path.join(overlayRoot, 'README.md'), 'utf8')
    for (const phrase of ['One key lights it up', 'Meet the staff', "What's inside", 'Free vs. Octi CC', 'Support', 'License', 'Developed by **Carl Farrington of Farrington Development LLC**']) {
      expect(readme).toContain(phrase)
    }
    for (const agent of ['Maggie', 'Craig', 'Sasha', 'Linda', 'Matilda']) expect(readme).toContain(agent)
    for (const match of readme.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
      if (/^https?:\/\//.test(match[1])) continue
      expect(fs.existsSync(path.join(overlayRoot, match[1])), match[1]).toBe(true)
    }
    for (const match of readme.matchAll(/\[[^\]]+\]\((docs\/[^)]+)\)/g)) {
      expect(fs.existsSync(path.join(overlayRoot, match[1])), match[1]).toBe(true)
    }
  })

  it('includes every required short guide and dark product screenshots', () => {
    for (const file of ['first-run.md', 'voice-receptionist.md', 'model-providers.md', 'e-sign.md', 'documents-and-linda.md', 'running-on-a-vps.md', 'upgrading.md']) {
      const content = fs.readFileSync(path.join(overlayRoot, 'docs/guides', file), 'utf8')
      expect(content.length, file).toBeGreaterThan(250)
    }
    const screenshots = fs.readdirSync(path.join(overlayRoot, 'docs/screenshots')).filter(file => file.endsWith('.jpg'))
    expect(screenshots.length).toBeGreaterThanOrEqual(3)
  })

  it('provides the coming-soon repository home for the public placeholder repo', () => {
    const readme = fs.readFileSync(path.join(overlayRoot, 'COMING_SOON_README.md'), 'utf8')
    expect(readme).toContain('OpenOcti is almost here')
    expect(readme).toContain('Maggie, Craig, Sasha, Linda, and Matilda')
  })
})
