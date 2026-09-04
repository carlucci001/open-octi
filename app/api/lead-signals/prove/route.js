import { NextResponse } from 'next/server'
import { provingHistory } from '@/lib/lead-signals/proving'
import { createSourceProvingJob, listSourceProvingJobs, runSourceProvingJob } from '@/lib/lead-signals/proving-jobs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request) {
  const sourceId = new URL(request.url).searchParams.get('sourceId') || ''
  return NextResponse.json({ ok: true, history: provingHistory(sourceId), jobs: listSourceProvingJobs({ sourceId }) })
}

export async function POST(request) {
  let body
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.sourceId) return NextResponse.json({ ok: false, error: 'sourceId is required' }, { status: 400 })
  const { job, created } = createSourceProvingJob({
    sourceId: body.sourceId,
    jurisdiction: body.jurisdiction || {},
    since: body.since,
    limit: body.limit,
    index: body.index === true,
  })
  if (created) void runSourceProvingJob(job.id, { index: body.index === true })
  return NextResponse.json({ ok: true, jobId: job.id, job, deduplicated: !created }, { status: 202 })
}
