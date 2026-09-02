import { describe, it, expect } from 'vitest'
import { publishPostizPost } from '../lib/postiz-publish'

const assignments = {
  map: { chFD: 'farrington-development', chNews: 'farrington-development' },
  defaultTenantId: 'farrington-development',
  brandMap: { chFD: 'farrington-development', chNews: 'newsroom-aios' },
  defaultBrandId: 'farrington-development',
}
// Unreachable base: enforcement failures throw BEFORE any network call; a
// 'create-post' stage failure proves validation passed.
const config = { base: 'http://127.0.0.1:9/api/public/v1', key: 'k', publicUrl: 'http://x' }

describe('postiz brand enforcement', () => {
  it('blocks a house-brand publish from fanning out to another brand channel', async () => {
    await expect(publishPostizPost({
      content: 'x',
      channels: ['chFD', 'chNews'],
      tenantId: 'farrington-development',
      brandId: 'farrington-development',
      config,
      tenantAssignments: assignments,
    })).rejects.toMatchObject({ code: 'channel_brand_mismatch', status: 403, stage: 'brand-validation' })
  })

  it('allows a matching-brand publish through validation', async () => {
    await expect(publishPostizPost({
      content: 'x',
      channels: ['chNews'],
      tenantId: 'farrington-development',
      brandId: 'newsroom-aios',
      config,
      tenantAssignments: assignments,
    })).rejects.toMatchObject({ stage: 'create-post' })
  })

  it('skips the brand check when brandId is empty (legacy operator path)', async () => {
    await expect(publishPostizPost({
      content: 'x',
      channels: ['chFD', 'chNews'],
      tenantId: 'farrington-development',
      brandId: '',
      config,
      tenantAssignments: assignments,
    })).rejects.toMatchObject({ stage: 'create-post' })
  })
})
