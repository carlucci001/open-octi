import { readData, writeData } from './dataStore'

export function getNetworkMode() {
  const d = readData('network-mode.json') || {}
  return d.mode === 'solo' ? 'solo' : 'multi'
}

export function setNetworkMode(mode) {
  if (mode !== 'solo' && mode !== 'multi') throw new Error('mode must be solo or multi')
  writeData('network-mode.json', { mode, updatedAt: new Date().toISOString() })
  return mode
}

// True if the request came in via Cloudflare's edge (i.e., from the public internet),
// false if it came in directly via Tailscale or localhost.
export function cameViaCloudflare(request) {
  return Boolean(request.headers.get('cf-ray'))
}
