import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { manifestFor } from '../app/manifest.js'
import { brandAssetsFor, brandMetadataFor } from '../lib/brand-assets.js'

const root = process.cwd()
const asset = name => path.join(root, 'public', 'openocti', name)

function pngMetadata(name) {
  const data = fs.readFileSync(asset(name))
  expect(data.subarray(1, 4).toString('ascii')).toBe('PNG')
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    colorType: data.readUInt8(25),
  }
}

describe('OpenOcti octopus logo lockup', () => {
  it('ships transparent vertical, horizontal, SVG, and favicon assets', () => {
    expect(pngMetadata('logo.png')).toEqual({ width: 1200, height: 960, colorType: 6 })
    expect(pngMetadata('logo-horizontal.png')).toEqual({ width: 1200, height: 360, colorType: 6 })
    expect(pngMetadata('favicon.png')).toEqual({ width: 512, height: 512, colorType: 6 })

    const svg = fs.readFileSync(asset('logo.svg'), 'utf8')
    expect(svg).toContain('data:image/png;base64,')
    expect(svg).toContain('Space Grotesk')
    expect(svg).toContain('#0070d0')
    expect(svg).toContain('#30c0f0')
    expect(svg).toContain('>OPENOCTI</text>')
    expect(svg).not.toMatch(/Command Center|Farrington/i)

    const ico = fs.readFileSync(asset('favicon.ico'))
    expect(ico.readUInt16LE(2)).toBe(1)
    expect(ico.readUInt16LE(4)).toBe(6)
  })

  it('selects octopus assets only for the OpenOcti edition', () => {
    expect(brandAssetsFor({ FCC_EDITION: 'openocti' })).toMatchObject({
      openOcti: true,
      loaderLogo: '/openocti/logo.png',
      shellLogo: '/openocti/logo-horizontal.png',
      productLogo: '/openocti/logo.png',
      faviconPng: '/openocti/favicon.png',
      faviconIco: '/openocti/favicon.ico',
    })
    expect(brandAssetsFor({})).toMatchObject({
      openOcti: false,
      loaderLogo: '/brand/command-center-loader/cclogo.png',
      shellLogo: '/brand/command-center-logo.png',
      faviconSvg: '/icon.svg',
    })
  })

  it('publishes an OpenOcti PWA manifest with the octopus icon', () => {
    const pwa = manifestFor({ FCC_EDITION: 'openocti' })
    expect(pwa.name).toBe('OpenOcti')
    expect(pwa.short_name).toBe('OpenOcti')
    expect(pwa.scope_extensions).toBeUndefined()
    expect(pwa.icons).toEqual([
      { src: '/openocti/favicon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ])
  })

  it('keeps OpenOcti metadata and manifest free of legacy product names', () => {
    const rendered = JSON.stringify({
      metadata: brandMetadataFor({ FCC_EDITION: 'openocti' }),
      manifest: manifestFor({ FCC_EDITION: 'openocti' }),
    })
    expect(rendered).toContain('OpenOcti')
    expect(rendered).not.toMatch(/Command Center|Farrington/i)
  })

  it('routes every active app brand surface through the edition asset map', () => {
    const contracts = {
      'app/login/page.js': 'BRAND_ASSETS.loaderLogo',
      'app/dashboard/Dashboard.js': 'BRAND_ASSETS.loaderLogo',
      'app/layout.js': 'BRAND_ASSETS.loaderLogo',
      'app/page.js': 'EDITION_BRAND.shellLogo',
      'app/components/ChatPanel.js': 'BRAND_ASSETS.faviconPng',
      'lib/productCatalog.js': 'BRAND_ASSETS.productLogo',
      'app/products/ProductCatalogManager.js': 'brandAssetsFor().productLogo',
      'app/favicon.ico/route.js': 'brand.faviconIco',
      'lib/emailSignature.js': 'OPENOCTI_EMAIL_LOGOS',
      'lib/signedDocumentArchive.js': "['openocti', 'logo-horizontal.png']",
      'app/api/documents/route.js': "['openocti', 'logo-horizontal.png']",
    }

    for (const [file, marker] of Object.entries(contracts)) {
      expect(fs.readFileSync(path.join(root, file), 'utf8'), file).toContain(marker)
    }
  })
})
