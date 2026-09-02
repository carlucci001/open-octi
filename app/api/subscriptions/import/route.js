import { NextResponse } from 'next/server'
import { readData, writeData } from '@/lib/dataStore'
import { requireCrmWrite } from '@/lib/permissions'
import { parseSubscriptionCsv, subscriptionMatchKey } from '@/lib/subscriptionImport'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FILE = 'subscriptions.json'

function load() {
  const wrap = readData(FILE) || { subscriptions: [], lastUpdated: null }
  return Array.isArray(wrap) ? { subscriptions: wrap, lastUpdated: null } : wrap
}

function save(wrap) {
  wrap.lastUpdated = new Date().toISOString()
  writeData(FILE, wrap)
}

function genId() {
  return 'sub_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function existingIndexByKey(subscriptions) {
  const map = new Map()
  subscriptions.forEach((subscription, index) => {
    const key = subscriptionMatchKey(subscription)
    if (key.replace(/\|/g, '')) map.set(key, index)
  })
  return map
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error

  try {
    const form = await request.formData()
    const file = form.get('file')
    if (!file || typeof file.text !== 'function') {
      return NextResponse.json({ ok: false, error: 'CSV file is required' }, { status: 400 })
    }

    const text = await file.text()
    const parsed = parseSubscriptionCsv(text)
    const data = load()
    const indexByKey = existingIndexByKey(data.subscriptions)
    const importedAt = new Date().toISOString()
    const errors = []
    const warnings = []
    let created = 0
    let updated = 0

    for (const result of parsed.records) {
      if (!result.ok) {
        errors.push({ row: result.rowNumber, error: result.error })
        continue
      }

      if (result.warnings?.length) {
        warnings.push({ row: result.rowNumber, missing: result.warnings })
      }

      const next = {
        ...result.subscription,
        importedAt,
        updatedAt: importedAt,
      }
      const key = subscriptionMatchKey(next)
      const match = indexByKey.get(key)

      if (match === undefined) {
        const subscription = {
          id: genId(),
          ...next,
          createdAt: importedAt,
        }
        data.subscriptions.push(subscription)
        indexByKey.set(key, data.subscriptions.length - 1)
        created++
      } else {
        data.subscriptions[match] = {
          ...data.subscriptions[match],
          ...next,
          id: data.subscriptions[match].id,
          createdAt: data.subscriptions[match].createdAt || importedAt,
        }
        updated++
      }
    }

    if (created || updated) save(data)

    return NextResponse.json({
      ok: true,
      created,
      updated,
      skipped: errors.length,
      warnings,
      errors,
      subscriptions: data.subscriptions,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
