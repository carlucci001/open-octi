import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ avatars: {} }))
vi.mock('../lib/dataStore', () => ({ readData: file => file === 'avatars.json' ? state.avatars : {}, writeData: vi.fn() }))
import { defaultAgentAvatar, OPENOCTI_PORTRAIT_IDS } from '../lib/openocti-agent-avatars'
import { getAvatarMeta } from '../lib/avatar-gen'

beforeEach(() => { vi.stubEnv('FCC_EDITION', 'openocti'); state.avatars = {} })
afterEach(() => vi.unstubAllEnvs())

it('ships a self-contained portrait for every default human agent', () => {
  expect(OPENOCTI_PORTRAIT_IDS).toHaveLength(14)
  for (const id of OPENOCTI_PORTRAIT_IDS) {
    const avatar = getAvatarMeta(id)
    expect(avatar.provider).toBe('openocti-default')
    const svg = fs.readFileSync(path.join(process.cwd(), 'public', avatar.url), 'utf8')
    expect(svg).toContain('data:image/webp;base64,')
    expect(svg).not.toMatch(/https?:\/\/(?!www.w3.org)/)
    expect(Buffer.byteLength(svg)).toBeLessThan(16000)
  }
})
it('preserves uploads and restores the bundled default when an upload is removed', () => {
  expect(getAvatarMeta('main', '/api/media/file/legacy-avatar.png').url).toBe('/api/media/file/legacy-avatar.png')
  state.avatars.main = { url: '/api/media/file/my-upload.png', provider: 'upload' }
  expect(getAvatarMeta('main', '/api/media/file/legacy-avatar.png')).toEqual(state.avatars.main)
  expect(getAvatarMeta('main')).toEqual(state.avatars.main)
  delete state.avatars.main
  expect(getAvatarMeta('main')).toEqual(defaultAgentAvatar('main'))
})
it('keeps the Octi mascot and does not assign public defaults to private or custom agents', () => {
  expect(getAvatarMeta('octi').provider).toBe('openocti-brand')
  expect(getAvatarMeta('octi-guide').provider).toBe('openocti-brand')
  expect(defaultAgentAvatar('custom-id')).toBeNull()
  vi.stubEnv('FCC_EDITION', 'farrington')
  expect(defaultAgentAvatar('main')).toBeNull()
})
