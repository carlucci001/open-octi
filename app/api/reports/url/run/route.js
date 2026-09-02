// Start a URL report without holding the HTTP request open for it, and poll
// for the outcome. See lib/url-report-runs.js for why: a synchronous run
// routinely outlives Cloudflare's 100-second proxy ceiling, and the 524 that
// follows reaches the browser as HTML — which is what "I hit Run and nothing
// happened" actually was.
import { NextResponse } from 'next/server'
import { requireCrmWrite, requireCrmRead } from '@/lib/permissions'
import { readData } from '@/lib/dataStore'
import { URL_REPORT_TYPES } from '@/lib/url-report-engine'
import { startUrlReportRun, getUrlReportRun, publicRun, urlReportHistory } from '@/lib/url-report-runs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function findAccount(accountId) {
  const store = readData('accounts.json')
  const accounts = Array.isArray(store) ? store : (store?.accounts || [])
  return accounts.find(item => item?.id === accountId) || null
}

export async function POST(request) {
  const { error, user } = await requireCrmWrite(request)
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const account = findAccount(String(body.accountId || '').trim())
  if (!account) return NextResponse.json({ ok: false, error: 'Account not found' }, { status: 404 })

  const url = String(body.url || account.website || '').trim()
  if (!url) {
    return NextResponse.json({ ok: false, error: 'No website on this account, and none was supplied.' }, { status: 400 })
  }
  const types = Array.isArray(body.types) && body.types.length
    ? body.types.filter(type => URL_REPORT_TYPES[type])
    : Object.keys(URL_REPORT_TYPES)
  if (!types.length) {
    return NextResponse.json({ ok: false, error: 'Pick at least one of SEO, AEO, or GEO.' }, { status: 400 })
  }

  const run = startUrlReportRun({
    url,
    types,
    accountId: account.id,
    accountName: account.name || '',
    createdBy: user?.id || user?.email || 'crm',
  })
  return NextResponse.json({ ok: true, ...publicRun(run) })
}

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error

  const params = new URL(request.url).searchParams
  const accountId = String(params.get('accountId') || '').trim()
  const runId = String(params.get('runId') || '').trim()

  if (runId) {
    const run = getUrlReportRun(runId)
    if (!run) {
      // The registry is in memory, so a server restart mid-run loses the
      // handle. Say that plainly rather than spinning forever.
      return NextResponse.json({
        ok: false,
        status: 'unknown',
        error: 'That run is no longer tracked — the server restarted, or it finished more than 30 minutes ago. Check Documents > Reports before re-running.',
      }, { status: 404 })
    }
    return NextResponse.json({ ok: true, ...publicRun(run) })
  }

  if (!accountId) {
    return NextResponse.json({ ok: false, error: 'accountId or runId is required' }, { status: 400 })
  }
  const history = urlReportHistory(readData, accountId, Number(params.get('limit')) || 12)
  return NextResponse.json({
    ok: true,
    accountId,
    latest: history[0] || null,
    previous: history[1] || null,
    history,
  })
}
