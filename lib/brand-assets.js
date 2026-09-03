import { isOpenOcti } from '@/lib/edition'

const COMMAND_CENTER_ASSETS = Object.freeze({
  loaderLogo: '/brand/command-center-loader/cclogo.png',
  shellLogo: '/brand/command-center-logo.png',
  productLogo: '/brand/command-center-logo.png',
  faviconSvg: '/icon.svg',
  faviconPng: '/apple-touch-icon.png',
  faviconIco: '/favicon.ico',
})

const OPENOCTI_ASSETS = Object.freeze({
  loaderLogo: '/openocti/logo.png',
  shellLogo: '/openocti/logo-horizontal.png',
  productLogo: '/openocti/logo.png',
  faviconSvg: '/openocti/logo.svg',
  faviconPng: '/openocti/favicon.png',
  faviconIco: '/openocti/favicon.ico',
})

export function brandAssetsFor(env) {
  const openOcti = isOpenOcti(env)
  return {
    ...(openOcti ? OPENOCTI_ASSETS : COMMAND_CENTER_ASSETS),
    openOcti,
    editionName: openOcti ? 'OpenOcti' : 'Command Center',
  }
}

export function brandMetadataFor(env) {
  const openOcti = isOpenOcti(env)
  const brand = brandAssetsFor(env)
  return {
    title: openOcti ? 'OpenOcti' : 'Farrington Command Center',
    description: openOcti ? 'Open-source AI operations workspace' : 'Domains, clients, payments, credentials — Farrington Development LLC',
    manifest: '/manifest.webmanifest',
    applicationName: openOcti ? 'OpenOcti' : 'Command Center',
    appleWebApp: { capable: true, statusBarStyle: 'default', title: openOcti ? 'OpenOcti' : 'Command Center' },
    icons: { icon: brand.openOcti ? brand.faviconIco : brand.faviconSvg, shortcut: brand.openOcti ? brand.faviconIco : brand.faviconSvg, apple: brand.faviconPng },
    other: { 'mobile-web-app-capable': 'yes' },
  }
}

