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

  it.each([
    [joined('tel:', '+', '1828', '7709227'), 'tel:PHONE_REDACTED'],
    [joined('(828)', ' 770-9227'), 'PHONE_REDACTED'],
    [joined('phone: ', '828', '770', '9227'), 'phone: PHONE_REDACTED'],
    [joined('Ashe', 'ville, NC'), 'City, ST'],
    [joined('carl', 'farring'), 'workspace-owner'],
  ])('neutralizes private contact value %s', (value, expected) => {
    expect(neutralizeOpenOctiReferences(value)).toBe(expected)
  })
})
