import { NextResponse } from 'next/server'
import { requireCrmWrite } from '@/lib/permissions'
import { readData } from '@/lib/dataStore'
import { runUrlReport, UrlReportError, URL_REPORT_TYPES } from '@/lib/url-report-engine'
import { registerSearchTools3Completion } from '@/lib/SearchTools3-engagements'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  const { error, user } = await requireCrmWrite(request)
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const accountId = String(body.accountId || '').trim()
  const store = readData('accounts.json')
  const accounts = Array.isArray(store) ? store : (store?.accounts || [])
  const account = accounts.find(item => item?.id === accountId)
  if (!account) return NextResponse.json({ ok: false, error: 'Account not found' }, { status: 404 })

  const url = String(body.url || account.website || '').trim()
  const types = Array.isArray(body.types) && body.types.length ? body.types : Object.keys(URL_REPORT_TYPES)

  try {
    const result = await runUrlReport({
      url,
      types,
      accountId: account.id,
      accountName: account.name || '',
      createdBy: user?.id || user?.email || 'crm',
    })
    try {
      registerSearchTools3Completion({
        documentId: result.documentId,
        accountId: account.id,
        summary: result.summary,
      })
    } catch (engagementError) {
      console.error('[url-report-engagement]', engagementError?.message)
    }
    return NextResponse.json({ ok: true, ...result })
  } catch (reportError) {
    const status = reportError instanceof UrlReportError && reportError.stage === 'input' ? 400 : 502
    console.error('[url-report]', reportError?.message)
    return NextResponse.json({ ok: false, error: reportError?.message || 'Report generation failed' }, { status })
  }
}
