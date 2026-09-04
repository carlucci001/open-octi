import { NextResponse } from 'next/server'
import { loadLeadSourceRegistry } from '@/lib/lead-signals/registry'
import { provingHistory } from '@/lib/lead-signals/proving'
import { listSourceProvingJobs } from '@/lib/lead-signals/proving-jobs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function groupFor(source) {
  if (source.level === 'federal') return { rank: 0, label: 'Federal' }
  if (source.level === 'state' && !source.discovered) return { rank: 1, label: 'State' }
  if (source.discovered) return { rank: 2, label: 'Your area (discovered)' }
  return { rank: 3, label: 'Local examples' }
}

export async function GET() {
  const history = provingHistory()
  const latest = new Map()
  for (const validation of history) if (!latest.has(validation.sourceId)) latest.set(validation.sourceId, validation)
  const latestJobs = new Map()
  for (const job of listSourceProvingJobs()) if (!latestJobs.has(job.sourceId)) latestJobs.set(job.sourceId, job)
  const sources = loadLeadSourceRegistry().map(source => {
    const group = groupFor(source)
    const validation = latest.get(source.id)
    const job = latestJobs.get(source.id)
    const needsKey = source.auth?.type === 'key' && source.auth?.env && !process.env[source.auth.env]
    const jobStatus = job?.status === 'running' ? 'running' : job?.status === 'failed' ? 'failed' : null
    return {
      ...source,
      notes: undefined,
      group: group.label,
      groupRank: group.rank,
      proving: {
        ...source.proving,
        status: needsKey ? 'needs-key' : (jobStatus || validation?.status || source.proving?.status || 'candidate'),
        score: validation?.score ?? source.proving?.score ?? null,
        job: job ? { id: job.id, status: job.status, progress: job.progress, error: job.error } : null,
      },
      settingsLink: needsKey ? source.auth.settingsLink : null,
    }
  }).sort((a, b) => a.groupRank - b.groupRank || a.name.localeCompare(b.name))
  return NextResponse.json({ ok: true, sources, counts: { total: sources.length, proven: sources.filter(source => source.proving.status === 'proven').length, excluded: sources.filter(source => source.proving.status === 'excluded-from-build').length } })
}
