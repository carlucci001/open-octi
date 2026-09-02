import { NextResponse } from 'next/server'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'
import { getReleaseSummary, saveReleaseSummary } from '@/lib/release-summaries'
import { deleteReleaseAnnotation, saveReleaseAnnotation } from '@/lib/release-annotations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function publicSummary(row) {
  if (!row) return null
  return {
    id: row.id,
    platformId: row.platformId,
    releaseId: row.releaseId,
    previousReleaseId: row.previousReleaseId || '',
    summary: row.summary,
    runId: row.runId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const { searchParams } = new URL(request.url)
  const summary = getReleaseSummary(searchParams.get('platformId'), searchParams.get('releaseId'))
  return NextResponse.json({ ok: true, summary: publicSummary(summary) }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  try {
    const body = await request.json()
    if (body?.action === 'save-annotation') {
      return NextResponse.json({ ok: true, annotation: saveReleaseAnnotation(body) })
    }
    if (body?.action === 'delete-annotation') {
      return NextResponse.json({ ok: true, result: deleteReleaseAnnotation(body) })
    }
    const summary = saveReleaseSummary(body)
    return NextResponse.json({ ok: true, summary: publicSummary(summary) })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || 'Invalid release summary.' }, { status: 400 })
  }
}
