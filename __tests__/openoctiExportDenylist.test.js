import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  matchOpenOctiDenylist,
  neutralizeOpenOctiReferences,
  scanOpenOctiDenylist,
} from '../scripts/export-openocti.mjs'

const joined = (...parts) => parts.join('')

describe('OpenOcti export product denylist', () => {
  it.each([
    ['search product prefix', joined('get', 'found')],
    ['remediation product prefix', joined('get', 'remedy')],
    ['video product', joined('my', 'vtc')],
    ['news product compact', joined('newsroom', 'aios')],
    ['news product hyphenated', joined('newsroom-', 'aios')],
    ['workflow product', joined('vibn', 'flow')],
    ['flip product', joined('vibn', 'flip')],
    ['alternate workflow spelling', joined('vibin', 'flow')],
    ['owner domain', joined('carl', 'farrington.com')],
    ['company domain', joined('farrington', 'development.com')],
    ['production host label', joined('fcc-', 'prod')],
    ['telephone href', joined('tel:', '+', '1828', '7709227')],
    ['private city', joined('Ashe', 'ville')],
    ['owner personal identifier', joined('carl', 'farring')],
    ['closed search suite', joined('Search', 'Suite')],
    ['closed content suite', joined('Content', 'Hub')],
    ['private publication id', joined('wnc', '_times')],
    ['private knowledge label', joined('Farrington', ' Knowledge')],
    ['private mail label', joined('Command Center', ' Mail')],
    ['personal home path', joined('/home/', 'carl')],
  ])('matches %s case-insensitively', (_label, value) => {
    expect(matchOpenOctiDenylist(value.toUpperCase())).not.toEqual([])
  })

  it.each([
    joined('octi', 'cc.com'),
    joined('open', 'octi.com'),
    'Your company',
    'https://example.com',
  ])('allows public or neutral value %s', (value) => {
    expect(matchOpenOctiDenylist(value)).toEqual([])
  })

  it('scans service files and reports file:line diagnostics', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openocti-denylist-'))
    try {
      fs.writeFileSync(path.join(root, 'sample.service'), joined('company=https://farrington', 'development.com'))
      expect(() => scanOpenOctiDenylist(root)).toThrow(/sample\.service:1:/)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('allows the explicitly portable NC lead-source pack but not unrelated private-city references', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openocti-denylist-'))
    try {
      const city = joined('ashe', 'ville')
      const allowed = path.join(root, 'vault', 'lead-sources', 'city')
      fs.mkdirSync(allowed, { recursive: true })
      fs.writeFileSync(path.join(allowed, `${city}-permits.md`), `${city} public API`)
      expect(() => scanOpenOctiDenylist(root)).not.toThrow()
      fs.writeFileSync(path.join(root, 'unrelated.md'), city)
      expect(() => scanOpenOctiDenylist(root)).toThrow(/unrelated\.md:1:/)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it.each([
    [joined('tel:', '+', '1828', '7709227'), 'tel:PHONE_REDACTED'],
    [joined('(828)', ' 770-9227'), 'PHONE_REDACTED'],
    [joined('phone: ', '828', '770', '9227'), 'phone: PHONE_REDACTED'],
    [joined('Ashe', 'ville, NC'), 'City, ST'],
    [joined('carl', 'farring'), 'workspace-owner'],
    [joined('Search', 'Suite'), 'SearchTools'],
    [joined('Content', 'Hub'), 'ContentStudio'],
    [joined('wnc', '_times'), 'sample_business'],
    [joined('Farrington', ' Knowledge'), 'Knowledge'],
    [joined('Command Center', ' Mail'), 'Mail'],
    [joined('/home/', 'carl', '/dev/project'), '/srv/openocti/dev/project'],
  ])('neutralizes private contact value %s', (value, expected) => {
    expect(neutralizeOpenOctiReferences(value)).toBe(expected)
  })
})
