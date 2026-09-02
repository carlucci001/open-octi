import { describe, expect, it } from 'vitest'
import { parseResearchDossierInput } from '../lib/research-dossier-input'

describe('research dossier input', () => {
  it('requires a target when creating a dossier', () => {
    expect(parseResearchDossierInput({ summary: 'Missing target' })).toEqual({
      ok: false,
      error: 'Target is required',
    })
  })

  it('normalizes editable fields and line-based lists', () => {
    const result = parseResearchDossierInput({
      target: '  Acme Industries  ',
      source: 'manual',
      riskLevel: 'medium',
      confidence: 'High',
      summary: '  Strong fit.  ',
      redFlags: 'Late filings\n\nSparse references',
      sources: ['https://example.com', '  https://example.org  '],
    })

    expect(result.ok).toBe(true)
    expect(result.value).toMatchObject({
      target: 'Acme Industries',
      source: 'manual',
      riskLevel: 'medium',
      confidence: 'High',
      dossier: {
        executiveSummary: 'Strong fit.',
        redFlags: ['Late filings', 'Sparse references'],
        sources: ['https://example.com', 'https://example.org'],
      },
    })
  })

  it('supports partial updates and rejects empty patches', () => {
    expect(parseResearchDossierInput({ redFlags: '' }, { partial: true })).toEqual({
      ok: true,
      value: { dossier: { redFlags: [] } },
    })
    expect(parseResearchDossierInput({}, { partial: true })).toEqual({
      ok: false,
      error: 'No editable fields were provided',
    })
  })
})
