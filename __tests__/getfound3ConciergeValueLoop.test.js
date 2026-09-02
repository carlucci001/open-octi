import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

import { urlReportPriceCredits } from '@/lib/url-report-engine'
import {
  buildGetFound3EngagementBrief,
  isGetFound3Document,
} from '@/lib/getfound3-engagements'

const read = relativePath => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

describe('GetFound3 concierge report product', () => {
  it('prices one complete SEO, AEO, and GEO report at exactly 499 credits', () => {
    expect(urlReportPriceCredits(['seo', 'aeo', 'geo'])).toBe(499)
    expect(urlReportPriceCredits(['seo'])).toBe(499)
    expect(urlReportPriceCredits([])).toBe(0)
  })

  it('does not expose discipline checkboxes and sends only the URL', () => {
    const source = read('app/portal/components/WebsiteReportRunner.jsx')
    expect(source).toContain('Run complete report for $')
    expect(source).toContain('$4.99 once per report')
    expect(source).toContain('JSON.stringify({ url })')
    expect(source).not.toContain('type="checkbox"')
    expect(source).not.toContain('REPORT_TYPE_CHOICES')
    expect(source).not.toContain('$49 per report')
  })

  it('server-enforces all three disciplines and settles the wallet only after a report completes', () => {
    const source = read('app/api/portal/reports/url/route.js')
    const reserveIndex = source.indexOf('reserveWalletCredits({')
    const runIndex = source.indexOf('await runGetFound3Report(reportInput)')
    const commitIndex = source.indexOf('commitWalletReservation({')
    const releaseIndex = source.indexOf('releaseWalletReservation({')
    expect(source).toContain("Object.freeze(['seo', 'aeo', 'geo'])")
    expect(source).not.toContain('body.types')
    expect(reserveIndex).toBeGreaterThan(-1)
    expect(runIndex).toBeGreaterThan(reserveIndex)
    expect(commitIndex).toBeGreaterThan(runIndex)
    expect(releaseIndex).toBeGreaterThan(commitIndex)
    expect(source).toContain('Nothing was charged.')
  })
})
describe('GetFound3 remediation engagement brief', () => {
  const report = {
    id: 'doc_1',
    clientName: 'Example Company',
    linkedTo: { accountId: 'ac_1' },
    meta: {
      generator: 'getfound3-api',
      types: ['seo', 'aeo', 'geo'],
      url: 'https://example.com/',
      scores: { seo: 82, aeo: 61, geo: 39 },
      engagementSummary: 'The site is technically sound but needs stronger answer and AI visibility.',
      actionPlan: [
        {
          priority: 'high',
          discipline: 'GEO',
          title: 'Publish verifiable organization facts',
          why: 'AI systems need consistent facts.',
          impact: 'Improves citation readiness.',
        },
      ],
    },
  }

  it('recognizes complete report documents and creates a Cheryl-ready factual playbook', () => {
    expect(isGetFound3Document(report)).toBe(true)
    const brief = buildGetFound3EngagementBrief(report)
    expect(brief.scores).toEqual({ seo: 82, aeo: 61, geo: 39 })
    expect(brief.scoreCallout).toContain('GEO')
    expect(brief.opening).toContain('Example Company')
    expect(brief.discoveryQuestions).toHaveLength(3)
    expect(brief.handoff).toContain('do not promise rankings or AI citations')
    expect(brief.actionPlan[0].title).toBe('Publish verifiable organization facts')
  })

  it('rejects partial or unrelated documents from the control surface', () => {
    expect(isGetFound3Document({ ...report, meta: { ...report.meta, types: ['seo'] } })).toBe(false)
    expect(isGetFound3Document({ ...report, meta: { ...report.meta, generator: 'manual' } })).toBe(false)
  })
})
