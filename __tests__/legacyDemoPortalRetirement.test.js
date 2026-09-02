import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

describe('legacy Blue Ridge walkthrough boundaries', () => {
  it('does not expose the fictional application unless explicit review mode is enabled', () => {
    const app = read('public/cc-front/app.jsx')
    expect(app).toContain('new URLSearchParams(location.search).get("review") === "1"')
    expect(app).toContain('{reviewMode && <ScreenLauncher')
    expect(app).toContain('Fictional review prototype')
  })

  it('routes public signup interest to a lead-only walkthrough request instead of creating a fake account', () => {
    const marketing = read('public/cc-front/screens_marketing.jsx')
    const signup = marketing.slice(marketing.indexOf('function Signup'), marketing.indexOf('function AuthShell'))
    expect(signup).toContain('window.location.assign("/portal/demo")')
    expect(signup).toContain('No demo portal or account will be created')
    expect(signup).not.toContain('store.set')
    expect(signup).not.toContain('Create account')
    expect(marketing).not.toContain('Start free')
  })
})
