// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { afterEach, expect, it } from 'vitest'
import { ensureSessionSecret } from '../deploy/session-secret.mjs'
const directories = []
afterEach(() => { directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })) })
it('persists a random secret across restarts without a configured environment secret', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'openocti-session-test-')); directories.push(directory)
  const env = { CRM_DATA_DIR: directory }
  const first = ensureSessionSecret(env)
  expect(first).toMatch(/^[a-f0-9]{96}$/)
  expect(ensureSessionSecret(env)).toBe(first)
  expect(readFileSync(path.join(directory, '.session-secret'), 'utf8')).toBe(first)
})
it('preserves an explicitly configured secret', () => {
  expect(ensureSessionSecret({ CRM_SESSION_SECRET: 'configured-test-secret' })).toBe('configured-test-secret')
})
