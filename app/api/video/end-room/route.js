import { NextResponse } from 'next/server'
import { requireCrmWrite } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DAILY_ROOM_NAME = /^[A-Za-z0-9_-]{1,128}$/
// Daily's presence endpoint is eventually consistent: a just-ejected participant
// routinely still shows for a second or more. The original budget was 3 attempts
// at 150ms with no delay before the first retry — under half a second total —
// so ending a call you were yourself sitting in usually 409'd with "Daily still
// reports 1 participant" even though the eject had worked. Carl hit exactly that
// on room ff-instant-4v67tj (2026-07-29 17:19), retried ~100s later, and it
// succeeded. Budget is now ~3.8s of backoff, still strictly bounded and still
// fail-closed if participants genuinely remain.
const PRESENCE_CONFIRMATION_ATTEMPTS = 6
const PRESENCE_RETRY_BACKOFF_MS = [250, 400, 650, 1000, 1500]
const PRESENCE_RETRY_DELAY_MS = process.env.NODE_ENV === 'test' ? 0 : 150

async function dailyJson(url, options) {
  const response = await fetch(url, options)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.info || data.error || 'Daily could not end the meeting')
    error.status = response.status
    throw error
  }
  return data
}

function readPresence(data) {
  const participants = Array.isArray(data?.data) ? data.data : null
  const rawTotal = data?.total_count
  const total = Number(rawTotal)
  const hasValidTotal = typeof rawTotal === 'number' && Number.isInteger(total) && total >= 0
  const ids = participants
    ? [...new Set(participants.map(participant => String(participant?.id || '').trim()).filter(Boolean))]
    : []

  return {
    complete: !!participants && hasValidTotal && participants.length === total && ids.length === total,
    ids,
    total: hasValidTotal ? total : null,
  }
}

function incompletePresenceResponse(snapshot) {
  const detail = snapshot.total === null
    ? 'Daily presence response was incomplete, so the meeting shutdown could not be confirmed.'
    : `Daily reports ${snapshot.total} participants, but only ${snapshot.ids.length} can be safely targeted. The meeting remains active.`
  return NextResponse.json({ ok: false, error: detail }, { status: 409 })
}

async function pauseBeforeRetry(attempt = 0) {
  if (!PRESENCE_RETRY_DELAY_MS) return
  const wait = PRESENCE_RETRY_BACKOFF_MS[attempt - 1] ?? PRESENCE_RETRY_BACKOFF_MS[PRESENCE_RETRY_BACKOFF_MS.length - 1]
  await new Promise(resolve => setTimeout(resolve, wait))
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error

  try {
    const { room: rawRoom } = await request.json().catch(() => ({}))
    const room = String(rawRoom || '').trim()
    if (!DAILY_ROOM_NAME.test(room)) {
      return NextResponse.json({ ok: false, error: 'Valid Daily room name required' }, { status: 400 })
    }

    const apiKey = process.env.DAILY_API_KEY
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: 'Daily is not configured' }, { status: 503 })
    }

    const baseUrl = `https://api.daily.co/v1/rooms/${encodeURIComponent(room)}`
    const headers = { Authorization: `Bearer ${apiKey}` }
    const presenceUrl = `${baseUrl}/presence?limit=100`
    let initialRaw
    try {
      initialRaw = await dailyJson(presenceUrl, { method: 'GET', headers })
    } catch (err) {
      // A room Daily no longer knows about is already ended, and ending an ended
      // meeting is success — not a 502. This previously surfaced to the operator
      // as "Daily could not end the meeting" whenever the room had expired or was
      // closed from the Daily tab first, leaving the CRM record stuck open.
      if (err?.status === 404) {
        console.info(`[video/end-room] room=${room} gone from Daily — treating as already ended`)
        return NextResponse.json({ ok: true, ejectedIds: [], alreadyEnded: true })
      }
      throw err
    }
    const initialPresence = readPresence(initialRaw)

    if (!initialPresence.complete) {
      console.error(`[video/end-room] room=${room} incomplete presence payload (total=${initialPresence.total}, ids=${initialPresence.ids.length}) — refusing to confirm shutdown`)
      return incompletePresenceResponse(initialPresence)
    }
    if (!initialPresence.ids.length) {
      console.info(`[video/end-room] room=${room} already empty`)
      return NextResponse.json({ ok: true, ejectedIds: [] })
    }

    const data = await dailyJson(`${baseUrl}/eject`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: initialPresence.ids, ban: false }),
    })

    for (let attempt = 0; attempt < PRESENCE_CONFIRMATION_ATTEMPTS; attempt += 1) {
      if (attempt > 0) await pauseBeforeRetry(attempt)
      const confirmation = readPresence(await dailyJson(presenceUrl, { method: 'GET', headers }))
      if (!confirmation.complete) {
        console.error(`[video/end-room] room=${room} incomplete presence during confirmation — refusing to confirm shutdown`)
        return incompletePresenceResponse(confirmation)
      }
      if (confirmation.total === 0) {
        console.info(`[video/end-room] room=${room} confirmed empty after ${attempt + 1} check(s), ejected=${initialPresence.ids.length}`)
        return NextResponse.json({
          ok: true,
          ejectedIds: Array.isArray(data.ejectedIds) ? data.ejectedIds : [],
        })
      }

      if (attempt === PRESENCE_CONFIRMATION_ATTEMPTS - 1) {
        const noun = confirmation.total === 1 ? 'participant' : 'participants'
        console.error(`[video/end-room] room=${room} still reports ${confirmation.total} ${noun} after ${PRESENCE_CONFIRMATION_ATTEMPTS} checks — failing closed`)
        return NextResponse.json({
          ok: false,
          error: `Daily still reports ${confirmation.total} ${noun} after the eject request. The meeting remains active.`,
        }, { status: 409 })
      }
    }

    return NextResponse.json({ ok: false, error: 'Daily meeting shutdown could not be confirmed.' }, { status: 409 })
  } catch (err) {
    const status = Number.isInteger(err?.status) ? 502 : 500
    // This route used to fail completely silently — no console line on any path,
    // so a failed "End meeting" left nothing whatsoever in the journal to debug.
    console.error(`[video/end-room] failed (${status}): ${err?.message || err}`, err?.stack || '')
    return NextResponse.json({ ok: false, error: err.message || 'Could not end Daily meeting' }, { status })
  }
}
