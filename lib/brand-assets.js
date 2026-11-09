import { isOctiCc, isOpenOcti } from '@/lib/edition'

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

const OCTICC_ASSETS = Object.freeze({
  loaderLogo: '/octicc/octopus-mark.png',
  shellLogo: '/octicc/octopus-mark.png',
  productLogo: '/octicc/octopus-mark.png',
  faviconSvg: '/octicc/octopus-mark.png',
  faviconPng: '/octicc/octopus-mark.png',
  faviconIco: '/octicc/octopus-mark.png',
})

export function brandAssetsFor(env) {
  const openOcti = isOpenOcti(env)
  const octiCc = isOctiCc(env)
  return {
    ...(openOcti ? OPENOCTI_ASSETS : octiCc ? OCTICC_ASSETS : COMMAND_CENTER_ASSETS),
    openOcti,
    octiCc,
    editionName: openOcti ? 'OpenOcti' : octiCc ? 'Octi Command Center' : 'Command Center',
    productName: openOcti ? 'OpenOcti' : octiCc ? 'OctiCC' : 'OpenOcti',
  }
}

export function octiAvatarFor(agentId, env) {
  return isOpenOcti(env) && ['octi', 'octi-guide'].includes(agentId) ? OPENOCTI_ASSETS.faviconPng : null
}

export function brandMetadataFor(env) {
  const openOcti = isOpenOcti(env)
  const brand = brandAssetsFor(env)
  return {
    title: brand.productName,
    description: openOcti
      ? 'Open-source AI operations workspace'
      : brand.octiCc
        ? 'Commercial AI operations workspace from Your organization'
        : 'Domains, clients, payments, credentials — Your organization',
    manifest: '/manifest.webmanifest',
    applicationName: brand.editionName,
    appleWebApp: { capable: true, statusBarStyle: 'default', title: brand.editionName },
    icons: { icon: brand.openOcti ? brand.faviconIco : brand.faviconSvg, shortcut: brand.openOcti ? brand.faviconIco : brand.faviconSvg, apple: brand.faviconPng },
    other: { 'mobile-web-app-capable': 'yes' },
  }
}

