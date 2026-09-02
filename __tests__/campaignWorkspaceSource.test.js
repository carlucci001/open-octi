import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync('app/page.js', 'utf8')
const studio = readFileSync('app/campaign-studio/CampaignStudio.js', 'utf8')
const operator = readFileSync('app/campaign-studio/SocialOperatorPanel.jsx', 'utf8')
const planner = readFileSync('app/social/SocialPublishing.js', 'utf8')

describe('unified Campaigns workspace source contract', () => {
  it('presents one Campaigns door while preserving the old social route alias', () => {
    expect(page).toContain("id: 'campaign-studio'")
    expect(page).toContain("label: 'Campaigns'")
    const navTools = page.slice(page.indexOf('const NAV_TOOLS'), page.indexOf('const WORKSPACES'))
    expect(navTools).not.toContain("id: 'social'")
    expect(page).toContain("tab === 'social' && isAdmin && <CampaignStudio")
    expect(page).toContain('initialWorkspace="planner"')
  })

  it('uses an inline persisted five-stage wizard with connected Postiz channels', () => {
    for (const step of ['brief', 'generate', 'review', 'schedule', 'done']) {
      expect(studio).toContain(`'${step}'`)
    }
    expect(studio).toContain('aria-label="Campaign creation wizard"')
    expect(studio).not.toContain('role="dialog"')
    expect(studio).toContain("fetch('/api/postiz/channels?tenantId=farrington-development'")
    expect(studio).toContain("window.localStorage.setItem('fcc:campaigns-workspace-state'")
    expect(studio).toContain('function wizardButtonStyle')
    expect(studio).toMatch(/function wizardButtonStyle[\s\S]*minHeight: 48[\s\S]*fontSize: 16/)
  })

  it('opts only wizard-scheduled posts into the runner and preserves manual publishing', () => {
    expect(studio).toContain('autoPublish: true')
    expect(studio).toContain('publishAt,')
    expect(studio).toContain('channels: wizardSelectedChannels')
    expect(studio).toContain('const confirmPush = async')
    expect(studio).toContain('confirmPush(post)')
    expect(studio).toContain('campaignPublisher.connected')
    expect(studio).toContain('Automatic publishing connected')
    expect(studio).not.toContain('Automation runner not connected')
  })

  it('folds planner, channels, media, integrations, and Social Operator into Campaigns', () => {
    expect(studio).toContain('<SocialPublishing embedded')
    expect(planner).toContain("{ id: 'planner'")
    expect(planner).toContain("{ id: 'channels'")
    expect(planner).toContain("{ id: 'media'")
    expect(planner).toContain("{ id: 'integrations'")
    expect(planner).toContain('fcc:campaigns-planner-view')
    expect(operator).toContain('fcc:social-operator-draft')
  })
})
