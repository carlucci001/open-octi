import { loadMonitoringManifest, runScheduledMonitoring } from '../lib/monitoring/runtime.js'

const manifestPath = process.argv.slice(2).find(arg => !arg.startsWith('--'))
const manifest = await loadMonitoringManifest(manifestPath)
const { report, busy } = await runScheduledMonitoring({ manifest })
if (busy) {
  console.log('A monitoring run is already in progress')
  process.exit(0)
}

if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2))
else {
  console.log(`${report.installation.name}: ${report.status}`)
  for (const result of report.results) console.log(`${result.status.padEnd(16)} ${result.name}: ${result.summary}`)
}

process.exitCode = report.status === 'failed' ? 1 : 0
