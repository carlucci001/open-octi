import { NextResponse } from 'next/server'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'
import { CONTENT_WORKFLOWS, createContentJob, deleteContentJob, listContentJobs, updateContentJob } from '@/lib/content-lab'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const url = new URL(request.url)
  const jobs = listContentJobs({
    q: url.searchParams.get('q') || '',
    status: url.searchParams.get('status') || '',
    workflow: url.searchParams.get('workflow') || '',
    limit: url.searchParams.get('limit') || 50,
  })
  return NextResponse.json({ ok: true, workflows: CONTENT_WORKFLOWS, jobs })
}

export async function POST(request) {
  const { user, error } = await requireCrmWrite(request)
  if (error) return error
  const body = await request.json().catch(() => ({}))
  const action = body.action || 'generate'

  try {
    if (action === 'generate') {
      const job = await createContentJob({
        ...body,
        createdBy: user?.email || user?.name || 'content-lab',
      })
      return NextResponse.json({ ok: true, job })
    }
    if (action === 'update') {
      const job = updateContentJob(body.id, body.patch || body.job || {})
      if (!job) return NextResponse.json({ ok: false, error: 'content job not found' }, { status: 404 })
      return NextResponse.json({ ok: true, job })
    }
    if (action === 'delete') {
      return NextResponse.json({ ok: deleteContentJob(body.id) })
    }
    return NextResponse.json({ ok: false, error: `unknown action: ${action}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 })
  }
}
