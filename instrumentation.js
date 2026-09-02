export async function register() {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return
  if (process.env.NEXT_PHASE === 'phase-production-build') return

  const isProduction = process.env.NODE_ENV === 'production'

  if (isProduction) {
    const { startCampaignPublishScheduler } = await import('./lib/campaign-publish-scheduler')
    startCampaignPublishScheduler()
  }

  if (process.env.AUTOMATION_SCHEDULER === 'on' || isProduction) {
    const { startAutomationScheduler } = await import('./lib/automation-scheduler')
    startAutomationScheduler()
  }
}
