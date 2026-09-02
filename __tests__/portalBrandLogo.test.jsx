import fs from 'fs'
import path from 'path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PortalBrandLogo from '../app/portal/components/PortalBrandLogo'

describe('portal brand logo', () => {
  it('layers both theme assets inside one stable accessible frame', () => {
    render(<PortalBrandLogo />)
    const logo = screen.getByRole('img', { name: 'Farrington Development' })
    const images = logo.querySelectorAll('img')

    expect(images).toHaveLength(2)
    expect(images[0]).toHaveAttribute('src', '/brand/fd-brand-dark-transparent.png')
    expect(images[1]).toHaveAttribute('src', '/brand/fd-card-logo.png')
  })

  it('locks both themes to the same frame and compensates for light-logo padding', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'app/portal/components/portal-brand-logo.module.css'), 'utf8')

    expect(css).toMatch(/\.frame\s*{[^}]*width:\s*220px;[^}]*height:\s*54px;/s)
    expect(css).toMatch(/\.onLight\s*{[^}]*left:\s*-3\.4965%;[^}]*top:\s*-26\.9841%;[^}]*width:\s*104\.8951%;[^}]*height:\s*161\.9048%;/s)
    expect(css).toMatch(/\.onDark\s*{[^}]*inset:\s*0;[^}]*width:\s*100%;[^}]*height:\s*100%;/s)
  })
})
