import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ entities: {} }))

vi.mock('../lib/entityStore', () => ({
  loadAll: vi.fn(type => state.entities[type] || []),
  findById: vi.fn((type, id) => (state.entities[type] || []).find(item => item.id === id) || null),
  create: vi.fn((type, record) => {
    const created = { id: `${type}_${(state.entities[type] || []).length + 1}`, ...record }
    state.entities[type] = [created, ...(state.entities[type] || [])]
    return created
  }),
  update: vi.fn((type, id, patch) => {
    const index = (state.entities[type] || []).findIndex(item => item.id === id)
    if (index < 0) return null
    state.entities[type][index] = { ...state.entities[type][index], ...patch }
    return state.entities[type][index]
  }),
  remove: vi.fn(),
}))

import { listPlatforms, normalizePlatformInput, sanitizePlatform } from '../lib/platforms/registry'

const EXISTING_OPERATING_PLATFORMS = [
  ['farrington-command-center', 'Command Center'],
  ['getremedy3', 'GetRemedy3'],
  ['getfound3', 'GetFound3'],
  ['newsroom-aios', 'Newsroom AIOS'],
  ['vibnflow', 'VibnFlow'],
  ['vibnflip', 'VibnFlip'],
]

beforeEach(() => {
  state.entities = {
    accounts: [
      { id: 'ac_carl', name: 'Carl Farrington (portal — hidden)', type: 'client' },
      { id: 'ac_farrington', name: 'Farrington Development', type: 'in-house' },
    ],
    projects: [
      { id: 'pr_local_farrington_command_center', name: 'Farrington Command Center' },
      { id: 'pr_local_newsroomaios', name: 'NewsroomAIOS' },
      { id: 'pr_local_vibnflow', name: 'VibNFlow' },
      { id: 'pr_local_vibnflip', name: 'VibNFlip' },
    ],
    platforms: EXISTING_OPERATING_PLATFORMS.map(([platformId, name], index) => ({
      id: `pf_${index}`,
      platformId,
      name,
      url: `https://${platformId}.example.com`,
    })),
  }
})

describe('platform business relationships', () => {
  it('links all seven operating platforms to an in-house owner and a real project', () => {
    const platforms = listPlatforms()

    expect(platforms).toHaveLength(7)
    expect(platforms.every(platform => platform.ownershipType === 'in-house')).toBe(true)
    expect(platforms.every(platform => platform.accountId === 'ac_carl')).toBe(true)
    expect(platforms.every(platform => Boolean(platform.projectId))).toBe(true)
    expect(state.entities.projects).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'pr_local_getremedy3', name: 'GetRemedy3' }),
      expect.objectContaining({ id: 'pr_local_getfound3', name: 'GetFound3' }),
      expect.objectContaining({ id: 'pr_local_myvtc', name: 'MyVTC' }),
    ]))
    const operatingNames = [...EXISTING_OPERATING_PLATFORMS, ['myvtc', 'MyVTC']]
    expect(state.entities.projects.filter(project => operatingNames.some(([, name]) => (
      project.name.toLowerCase().replace(/\s/g, '') === name.toLowerCase().replace(/\s/g, '')
      || (name === 'Command Center' && project.name === 'Farrington Command Center')
    ))).every(project => project.accountId === 'ac_carl')).toBe(true)

    const newsroom = sanitizePlatform(platforms.find(platform => platform.platformId === 'newsroom-aios'))
    expect(newsroom).toMatchObject({
      ownershipType: 'in-house',
      accountId: 'ac_carl',
      accountName: 'Carl Farrington (portal — hidden)',
      projectId: 'pr_local_newsroomaios',
      projectName: 'NewsroomAIOS',
    })

    const myvtc = sanitizePlatform(platforms.find(platform => platform.platformId === 'myvtc'))
    expect(myvtc).toMatchObject({
      name: 'MyVTC',
      ownershipType: 'in-house',
      accountId: 'ac_carl',
      projectId: 'pr_local_myvtc',
      projectName: 'MyVTC',
      credentialRef: 'MyVTC Platform Admin',
      capabilities: ['customers', 'subscriptions', 'health', 'releases', 'errors', 'usage', 'revenue'],
      supportsActions: false,
      builtIn: true,
    })
  })

  it('requires every registration to have a project and client-owned platforms to have a client', () => {
    const base = { name: 'Client Platform', url: 'https://client-platform.example.com' }

    expect(() => normalizePlatformInput({ ...base, ownershipType: 'in-house' }))
      .toThrow('Related project is required')
    expect(() => normalizePlatformInput({ ...base, ownershipType: 'client', projectId: 'pr_local_newsroomaios' }))
      .toThrow('Client account is required')
  })
})
