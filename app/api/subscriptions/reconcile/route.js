import { NextResponse } from 'next/server'
import { readData } from '@/lib/dataStore'
import { requireCrmRead } from '@/lib/permissions'
import { parseReconciliationCsv } from '@/lib/subscriptionImport'
import { reconcileSubscriptionRecords } from '@/lib/subscriptionReconciliation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FILE = 'subscriptions.json'

function load() {
  const wrap = readData(FILE) || { subscriptions: [], lastUpdated: null }
  return Array.isArray(wrap) ? { subscriptions: wrap, lastUpdated: null } : wrap
}

export async function POST(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error

  try {
    const form = await request.formData()
    const file = form.get('file')
    if (!file || typeof file.text !== 'function') {
      return NextResponse.json({ ok: false, error: 'CSV file is required' }, { status: 400 })
    }

    const text = await file.text()
    const parsed = parseReconciliationCsv(text)
    const data = load()
    const result = reconcileSubscriptionRecords(data.subscriptions, parsed.records, {
      now: new Date(),
    })

    return NextResponse.json({
      ok: true,
      previewedAt: result.previewedAt,
      totalRows: parsed.records.length,
      ...result.summary,
      items: result.items,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
