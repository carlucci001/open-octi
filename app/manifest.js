import { brandAssetsFor } from '@/lib/brand-assets'

export function manifestFor(env) {
  const brand = brandAssetsFor(env)
  return {
    id: '/',
    name: brand.openOcti ? 'OpenOcti' : 'Farrington Command Center',
    short_name: brand.openOcti ? 'OpenOcti' : 'Command Center',
    description: brand.openOcti ? 'Open-source AI command center for business operations' : 'Domains, clients, payments, credentials — Farrington Development LLC',
    start_url: '/',
    scope: '/',
    ...(!brand.openOcti ? { scope_extensions: [
      {
        type: 'origin',
        origin: 'https://builder.farringtondevelopment.com',
      },
    ] } : {}),
    display: 'standalone',
    orientation: 'any',
    background_color: '#F4F1EA',
    theme_color: '#020711',
    icons: brand.openOcti ? [
      { src: brand.faviconPng, sizes: '512x512', type: 'image/png', purpose: 'any' },
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
