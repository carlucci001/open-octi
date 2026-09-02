import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Guards the gap that shipped once: surface_service_cards ran server-side in
// the text path and its result was thrown away, so the concierge talked about
// cards the client never saw. Voice was fine; text was not. If either half of
// the round trip is removed again, this fails the build.

const read = path => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('concierge card parity between voice and text', () => {
  it('the text route carries surfaced cards back to the browser', () => {
    const route = read('app/api/portal/concierge/route.js')
    expect(route).toMatch(/surfacedCards = \{ cards: result\.cards/)
    expect(route).toMatch(/return \{ text, surfacedCards, navigation \}/)
    expect(route).toMatch(/^\s*surfacedCards,$/m)
  })

  it('the text client paints them through the shared helper', () => {
    const core = read('app/portal/components/concierge-core.js')
    expect(core).toMatch(/import \{ dispatchSurfacedCards \} from '@\/lib\/portal-live-tools'/)
    expect(core).toMatch(/if \(result\.surfacedCards\) dispatchSurfacedCards\(result\.surfacedCards\)/)
  })

  it('the live-voice bridge still routes through that same helper', () => {
    const live = read('lib/portal-live-tools.js')
    expect(live).toMatch(/surface_service_cards' && result\?\.ok\) dispatchSurfacedCards\(result\)/)
  })
})
