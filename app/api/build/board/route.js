import { NextResponse } from 'next/server'

import {
  approveBuildBoardHandoff,
  createBuildBoardCard,
  getBuildBoardCard,
  listBuildBoardCards,
  moveBuildBoardCard,
  saveBuildBoardCard,
  syncBuildBoardCommits,
} from '@/lib/build-board'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function failure(error, status = 400) {
  const message = String(error?.message || error || 'Build Board request failed').replace(/\s+/g, ' ').trim().slice(0, 500)
  const unavailable = /Hermes|fetch failed|timed out|ECONNREFUSED/i.test(message)
  return NextResponse.json({ ok: false, error: message }, { status: unavailable ? 503 : status })
}

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  try {
    const id = new URL(request.url).searchParams.get('id')
    if (id) {
      const card = await getBuildBoardCard(id)
      if (!card) return NextResponse.json({ ok: false, error: 'Build Board card not found' }, { status: 404 })
      return NextResponse.json({ ok: true, card })
    }
    return NextResponse.json({ ok: true, ...(await listBuildBoardCards()) })
  } catch (loadError) {
    return failure(loadError, 500)
  }
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  let body
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }) }

  try {
    if (body.action === 'new_idea') {
      const card = await createBuildBoardCard({
        title: body.title,
        summary: body.summary,
        productId: body.productId,
        size: body.size,
        source: body.source || 'manual',
      })
      return NextResponse.json({ ok: true, card })
    }

    if (body.action === 'sync_commits') {
      return NextResponse.json({ ok: true, ...(await syncBuildBoardCommits()) })
    }

    const card = await getBuildBoardCard(body.id)
    if (!card) return NextResponse.json({ ok: false, error: 'Build Board card not found' }, { status: 404 })

    if (body.action === 'update_spec') {
      const updated = await saveBuildBoardCard({ ...card, specText: body.specText })
      return NextResponse.json({ ok: true, card: updated })
    }

    if (body.action === 'draft_spec') {
      const updated = await moveBuildBoardCard(card, 'Spec')
      return NextResponse.json({ ok: true, card: updated })
    }

    if (body.action === 'approve_handoff') {
      const result = await approveBuildBoardHandoff({ ...card, specText: body.specText ?? card.specText })
      return NextResponse.json({ ok: true, ...result })
    }

    if (body.action === 'move') {
      const updated = await moveBuildBoardCard(card, body.column)
      return NextResponse.json({ ok: true, card: updated })
    }

    return NextResponse.json({ ok: false, error: 'unknown Build Board action' }, { status: 400 })
  } catch (actionError) {
    return failure(actionError)
  }
}
