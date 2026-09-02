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

