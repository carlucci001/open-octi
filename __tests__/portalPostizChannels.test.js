import { describe, expect, it } from 'vitest'
import {
  mappedPortalChannels,
  selectMappedPortalChannels,
} from '../lib/portal-postiz-channels'

describe('portal Postiz channel mapping', () => {
  const session = { accountId: 'acct_one', tenantId: 'tenant_one' }
  const mapping = {
    map: { exact: 'tenant_one', wrong_account: 'tenant_one', wrong_tenant: 'tenant_other' },
    accountMap: { exact: 'acct_one', wrong_account: 'acct_other', wrong_tenant: 'acct_one' },
  }

  it('returns only safe channel fields after an exact account and tenant match', () => {
    const channels = mappedPortalChannels({
      session,
      mapping,
      integrations: [
        { id: 'exact', provider: 'instagram', name: 'Acme Social', accessToken: 'secret' },
        { id: 'wrong_account', provider: 'facebook', name: 'Other account' },
        { id: 'wrong_tenant', provider: 'linkedin', name: 'Other tenant' },
        { id: 'unmapped', provider: 'threads', name: 'Unmapped' },
      ],
    })

    expect(channels).toEqual([{ id: 'exact', provider: 'instagram', name: 'Acme Social' }])
    expect(channels[0]).not.toHaveProperty('accessToken')
  })

  it('deduplicates valid selections and rejects unassigned channel ids', () => {
    const available = [{ id: 'exact', provider: 'instagram', name: 'Acme Social' }]

    expect(selectMappedPortalChannels(available, ['exact', 'exact'])).toEqual({ channels: available })
    expect(selectMappedPortalChannels(available, ['other']).error).toMatch(/not assigned/i)
    expect(selectMappedPortalChannels(available, []).error).toMatch(/at least one/i)
  })
})
