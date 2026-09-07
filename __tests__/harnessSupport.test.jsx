import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import HarnessSupport, { getHarnessReleaseInfo, OPENOCTI_GITHUB_URL } from '../app/harness/HarnessSupport'

describe('public harness release support', () => {
  it('links each optional harness to OpenOcti without claiming it is installed', () => {
    for (const type of ['hermes', 'deerflow', 'deepseek']) {
      render(<HarnessSupport type={type} publicEdition />)
      const link = screen.getByRole('link')
      expect(link.getAttribute('href')).toBe(OPENOCTI_GITHUB_URL)
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toContain('noopener')
      expect(link.closest('[role="button"]')).toBeNull()
      cleanup()
    }
    expect(getHarnessReleaseInfo('hermes').label).toBe('Planned')
    expect(getHarnessReleaseInfo('deerflow').lane).toBe('Optional research profile')
    expect(getHarnessReleaseInfo('deepseek').note).toContain('separately configured runtime')
  })

  it('does not add a promotion to included OpenClaw or private editions', () => {
    const { rerender } = render(<HarnessSupport type="openclaw" publicEdition />)
    expect(screen.queryByRole('link')).toBeNull()
    rerender(<HarnessSupport type="hermes" publicEdition={false} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(getHarnessReleaseInfo('unrecognized')).toBeNull()
  })
})
