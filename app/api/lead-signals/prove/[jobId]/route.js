import { NextResponse } from 'next/server'
import { getSourceProvingJob } from '@/lib/lead-signals/proving-jobs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(_request, { params }) {
  const resolved = await params
  const job = getSourceProvingJob(resolved?.jobId)
  if (!job) return NextResponse.json({ ok: false, error: 'Proving job not found' }, { status: 404 })
  return NextResponse.json({ ok: true, job })
}
