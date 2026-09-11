import { expect, it, vi } from 'vitest'
vi.mock('@/lib/dataStore', () => ({ readData: () => null, writeData: vi.fn() }))
vi.mock('@/lib/octiccCatalog', async () => {
  const stub = await import('../lib/openocti/closed-module-stub.cjs')
  return { ADDITIONAL_COMMAND_CENTER_MODULES: stub.ADDITIONAL_COMMAND_CENTER_MODULES, createOctiCcProduct: stub.createOctiCcProduct }
})
import { getProductCatalog } from '../lib/productCatalog'

it('keeps the catalog usable without adding the private commercial product when that module is unavailable', () => {
  const catalog = getProductCatalog()
  expect(catalog.products.length).toBeGreaterThan(0)
  expect(catalog.products.every(product => product && product.id !== 'octi-cc')).toBe(true)
})
