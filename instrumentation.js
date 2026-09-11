export async function register() {
  // This exact runtime branch lets Next eliminate Node-only imports from the
  // Edge instrumentation bundle (including SQLite and the existing schedulers).
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerNodeServices } = await import('./lib/instrumentation-node')
    await registerNodeServices()
  }
}
