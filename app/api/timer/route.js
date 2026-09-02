// Voice-controllable timer state.
// One singleton timer (Carl is one user). State lives in data/timer-state.json so the
// browser UI and voice agents (via webhook tools) share it.
//
// State shape:
//   { accountId, accountName, sessionStartedAt, accumulatedMs, runStartedAt | null,
//     status: 'idle' | 'running' | 'paused', note: string }
//
// Endpoints:
//   GET  /api/timer            → current state
//   POST /api/timer            → { action: 'start' | 'pause' | 'resume' | 'stop' | 'note',
//                                  clientName?, accountId?, note? }
//
// On stop, we log through the shared time-tracking helper so the activity is
// recorded and the account's trackedSeconds is bumped.

import { NextResponse } from 'next/server'
import { readData, writeData } from '@/lib/dataStore'
import { logTimeTrackingSession } from '@/lib/timeTracking'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_STATE = { accountId: null, accountName: null, sessionStartedAt: null, accumulatedMs: 0, runStartedAt: null, status: 'idle', note: '' }

function loadState() {
  return readData('timer-state.json') || { ...DEFAULT_STATE }
}
function saveState(s) {
  writeData('timer-state.json', s)
}

function findAccount(query) {
  if (!query) return null
  const accountsFile = readData('accounts.json') || { accounts: [] }
  const list = accountsFile.accounts || []
  // Try id match first
  let m = list.find(a => a.id === query)
  if (m) return m
  // Then exact name (case-insensitive)
  const q = query.toLowerCase().trim()
  m = list.find(a => (a.name || '').toLowerCase() === q)
  if (m) return m
  // Then substring on name
  m = list.find(a => (a.name || '').toLowerCase().includes(q))
  if (m) return m
  // Then any token match
  const tokens = q.split(/\s+/).filter(Boolean)
  m = list.find(a => {
    const name = (a.name || '').toLowerCase()
    return tokens.every(t => name.includes(t))
  })
  return m || null
}

function liveElapsedMs(state) {
  let total = state.accumulatedMs || 0
  if (state.status === 'running' && state.runStartedAt) {
    total += Date.now() - new Date(state.runStartedAt).getTime()
  }
  return total
}
function fmt(secs) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.round(secs % 60)
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const state = loadState()
  const elapsedMs = liveElapsedMs(state)
  return NextResponse.json({
    ok: true,
    state,
    elapsedSeconds: Math.max(0, Math.floor(elapsedMs / 1000)),
    elapsedHumanReadable: fmt(Math.max(0, Math.floor(elapsedMs / 1000))),
  })
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  let body
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'Bad JSON' }, { status: 400 }) }
  const action = String(body.action || '').toLowerCase()
  let state = loadState()

  if (action === 'start') {
    // Pick the account: explicit accountId wins, else lookup by client name (accept snake or camel case)
    const accountIdHint = body.accountId || body.account_id
    const clientNameHint = body.clientName || body.client_name
    let account = null
    if (accountIdHint) account = findAccount(accountIdHint)
    if (!account && clientNameHint) account = findAccount(clientNameHint)
    if (!account) return NextResponse.json({ ok: false, error: `No account matched: "${clientNameHint || accountIdHint || ''}"` }, { status: 404 })

    // If a session is already running for a DIFFERENT client, refuse — Carl has to stop or discard first
    if (state.status !== 'idle' && state.accountId && state.accountId !== account.id) {
      return NextResponse.json({
        ok: false,
        error: `A timer is already ${state.status} for ${state.accountName}. Stop or discard that one before starting a new one.`,
        currentState: state,
      }, { status: 409 })
    }

    const now = new Date().toISOString()
    state = {
      accountId: account.id,
      accountName: account.name,
      sessionStartedAt: state.sessionStartedAt || now,
      accumulatedMs: state.accumulatedMs || 0,
      runStartedAt: now,
      status: 'running',
      note: body.note || state.note || '',
    }
    saveState(state)
    return NextResponse.json({ ok: true, state, message: `Timer started for ${account.name}.` })
  }

  if (action === 'pause') {
    if (state.status !== 'running') return NextResponse.json({ ok: false, error: 'Not currently running' }, { status: 400 })
    const now = Date.now()
    state.accumulatedMs = (state.accumulatedMs || 0) + (now - new Date(state.runStartedAt).getTime())
    state.runStartedAt = null
    state.status = 'paused'
    saveState(state)
    return NextResponse.json({ ok: true, state, message: `Timer paused for ${state.accountName} at ${fmt(Math.floor(state.accumulatedMs / 1000))}.` })
  }

  if (action === 'resume') {
    if (state.status !== 'paused') return NextResponse.json({ ok: false, error: 'No paused timer to resume' }, { status: 400 })
    state.runStartedAt = new Date().toISOString()
    state.status = 'running'
    saveState(state)
    return NextResponse.json({ ok: true, state, message: `Timer resumed for ${state.accountName}.` })
  }

  if (action === 'stop') {
    if (state.status === 'idle') return NextResponse.json({ ok: false, error: 'No timer to stop' }, { status: 400 })
    // Compute final
    let totalMs = state.accumulatedMs || 0
    if (state.status === 'running' && state.runStartedAt) totalMs += Date.now() - new Date(state.runStartedAt).getTime()
    const durationSeconds = Math.max(1, Math.floor(totalMs / 1000))
    const sessionStartedAt = state.sessionStartedAt
    const stoppedAt = new Date().toISOString()
    const accountId = state.accountId
    const accountName = state.accountName
    const stopNote = String(body.note || '').trim()
    const note = stopNote || state.note

    // Reset state BEFORE logging so a UI poll during the log call sees idle
    saveState({ ...DEFAULT_STATE })

    let j
    try {
      j = logTimeTrackingSession({ accountId, startedAt: sessionStartedAt, stoppedAt, durationSeconds, note })
    } catch (e) {
      return NextResponse.json({ ok: false, error: `Stop OK but log failed: ${e.message}` }, { status: 502 })
    }

    return NextResponse.json({
      ok: true,
      message: `Logged ${j.sessionLogged.durationHumanReadable} for ${accountName}. Total tracked for them: ${j.account.trackedHumanReadable}.`,
      logged: j,
    })
  }

  if (action === 'note') {
    if (state.status === 'idle') return NextResponse.json({ ok: false, error: 'No active timer to attach a note to' }, { status: 400 })
    const text = String(body.note || '').trim()
    if (!text) return NextResponse.json({ ok: false, error: 'note required' }, { status: 400 })
    state.note = state.note ? `${state.note}\n${text}` : text
    saveState(state)
    return NextResponse.json({ ok: true, state, message: `Note added to ${state.accountName}'s timer.` })
  }

  if (action === 'discard') {
    saveState({ ...DEFAULT_STATE })
    return NextResponse.json({ ok: true, message: 'Timer discarded — nothing logged.' })
  }

  return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })
}
