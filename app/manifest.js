import { brandAssetsFor } from '@/lib/brand-assets'

export function manifestFor(env) {
  const brand = brandAssetsFor(env)
  return {
    id: '/',
    name: brand.productName,
    short_name: brand.editionName,
    description: brand.openOcti
      ? 'Open-source AI operations workspace'
      : brand.octiCc
        ? 'Commercial AI operations workspace'
        : 'Domains, clients, payments, credentials — Your organization',
    start_url: '/',
    scope: '/',
    ...(!brand.openOcti && !brand.octiCc ? { scope_extensions: [
      {
        type: 'origin',
        origin: 'https://builder.company.example.com',
      },
    ] } : {}),
    display: 'standalone',
    orientation: 'any',
    background_color: '#F4F1EA',
    theme_color: '#020711',
    icons: brand.openOcti ? [
      { src: brand.faviconPng, sizes: '512x512', type: 'image/png', purpose: 'any' },
    ] : brand.octiCc ? [
      { src: brand.faviconPng, sizes: '802x519', type: 'image/png', purpose: 'any' },
    ] : [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  }
}

export default function manifest() {
  return manifestFor()
}
