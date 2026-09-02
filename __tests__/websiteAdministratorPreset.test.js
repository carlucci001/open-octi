import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

import { PRESETS } from '@/lib/agent-presets'

describe('website administrator preset', () => {
  it('is coordination-only until a verified website execution tool exists', () => {
    const preset = PRESETS.find(item => item.id === 'website-administrator')
    expect(preset).toBeTruthy()
    expect(preset.category).toBe('operations')
    expect(preset.tools).toContain('fcc_create_support_ticket')
    expect(preset.tools).toEqual(expect.arrayContaining([
      'fcc_list_vaults',
      'fcc_list_notes',
      'fcc_search_notes',
      'fcc_read_note',
    ]))
    expect(preset.tools).not.toContain('fcc_write_note')
    expect(preset.tools.some(tool => /wordpress|joomla|drupal|sftp|publish/i.test(tool))).toBe(false)
    expect(preset.jobDescription).toMatch(/never request, repeat, store/i)
    expect(preset.jobDescription).toMatch(/do not mutate external websites/i)
    expect(preset.jobDescription).toContain('website-administrator/wordpress.md')
    expect(preset.jobDescription).toContain('website-administrator/joomla.md')
    expect(preset.jobDescription).toContain('website-administrator/drupal.md')
    expect(preset.jobDescription).toContain('website-administrator/static-html-sftp.md')
    expect(preset.jobDescription).toContain('website-administrator/github-read-only.md')
    expect(preset.jobDescription).toContain('website-administrator/site-certification.md')
    expect(preset.jobDescription).toMatch(/literal case-insensitive path\/content substring search/i)
    expect(preset.jobDescription).toMatch(/not semantic FKL search/i)
    expect(preset.jobDescription).toMatch(/not account-path constrained/i)
  })

  it('provides a non-secret human-reviewed site dossier structure', () => {
    const dossierPath = path.join(
      process.cwd(),
      'data',
      'knowledge-base',
      'agents',
      'website-administrator',
      'site-dossier-template.md',
    )
    const dossier = fs.readFileSync(dossierPath, 'utf8')

    expect(dossier).toMatch(/human-reviewed Command Vault dossier/i)
    expect(dossier).toMatch(/may not write one/i)
    expect(dossier).toMatch(/connection record ID or opaque credential reference only/i)
    expect(dossier).toMatch(/Never include usernames paired with passwords, passwords, tokens, private keys/i)
    expect(dossier).toMatch(/Site certification/i)
  })
})
