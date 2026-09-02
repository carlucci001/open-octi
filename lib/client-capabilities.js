let manifestPromise = null

export async function clientCapabilityStatus(id) {
  if (typeof window === 'undefined') return { status: 'not_configured', missing: [] }
  if (!manifestPromise) {
    manifestPromise = fetch('/api/platform-admin/v1/capabilities', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`capabilities ${response.status}`)))
      .catch(() => ({ capabilities: [] }))
  }
  const manifest = await manifestPromise
  return manifest.capabilities?.find(item => item.id === id)
    || { id, status: 'not_configured', missing: [] }
}

export function clearClientCapabilityCache() {
  manifestPromise = null
}
