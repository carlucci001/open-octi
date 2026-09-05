const statusStore = globalThis.__fccIntegrationTestStatus || new Map()
globalThis.__fccIntegrationTestStatus = statusStore

export function recordIntegrationTest(capability, result) {
  const value = {
    ok: Boolean(result?.ok),
    status: result?.ok ? 'configured' : 'failing',
    message: String(result?.message || (result?.ok ? 'Connection verified.' : 'Connection failed.')),
    testedAt: new Date().toISOString(),
  }
  statusStore.set(capability, value)
  return value
}

export function integrationTestStatuses() {
  return Object.fromEntries(statusStore.entries())
}
