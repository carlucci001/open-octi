import { describe, expect, it } from 'vitest'

import { buildSnapshot } from '../app/mission-control/MissionControlClient'

describe('Mission Control portfolio revenue signal', () => {
  it('uses Money Console portfolio MRR instead of historical payment total', () => {
    const snapshot = buildSnapshot({
      accounts: [], projects: [], tasks: [], leads: [], activities: [], pulse: [], agents: [],
      payments: [{ amount: 999 }],
      money: { portfolio: { mrr: 125.5 } },
    })

    expect(snapshot.counts.revenue).toBe(125.5)
  })

  it('falls back to payment totals when the portfolio snapshot is unavailable', () => {
    const snapshot = buildSnapshot({ accounts: [], projects: [], tasks: [], leads: [], activities: [], pulse: [], agents: [], payments: [{ amount: 40 }, { amount: 2 }] })
    expect(snapshot.counts.revenue).toBe(42)
  })
})
