import { NextResponse } from 'next/server'
import { loadAll, create, update, remove, removeMany, findById, contactWithRelations } from '@/lib/entityStore'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (id) {
    const withRel = searchParams.get('with') === 'relations'
    const rec = withRel ? contactWithRelations(id) : findById('contacts', id)
    if (!rec) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ contact: rec })
  }
  const accountId = searchParams.get('accountId')
  let contacts = loadAll('contacts')
  if (accountId) contacts = contacts.filter(c => c.accountId === accountId)
  return NextResponse.json({ contacts })
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  const body = await request.json()

  if (body.action === 'add') {
    const rec = create('contacts', {
      name: '', email: '', phone: '', title: '',
      accountId: null, primary: false,
      tags: [], notes: '',
      ...body.contact,
    })
    return NextResponse.json({ ok: true, contact: rec })
  }

  // Duplicate probe: exact email, phone digits, or exact name (case-insensitive)
  if (body.action === 'dedupe_check') {
    const c = body.contact || {}
    const digits = v => (v || '').replace(/\D/g, '')
    const email = (c.email || '').trim().toLowerCase()
    const phone = digits(c.phone)
    const name = (c.name || '').trim().toLowerCase()
    const matches = loadAll('contacts').filter(x => {
      if (c.excludeId && x.id === c.excludeId) return false
      if (email && (x.email || '').trim().toLowerCase() === email) return true
      if (phone && phone.length >= 7 && digits(x.phone) === phone) return true
      if (name && (x.name || '').trim().toLowerCase() === name) return true
      return false
    }).slice(0, 5).map(x => ({ id: x.id, name: x.name, email: x.email || '', phone: x.phone || '' }))
    return NextResponse.json({ ok: true, matches })
  }

  if (body.action === 'update') {
    const rec = update('contacts', body.contact.id, body.contact)
    if (!rec) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ ok: true, contact: rec })
  }

  if (body.action === 'delete') {
    remove('contacts', body.id)
    return NextResponse.json({ ok: true })
  }

  // CSV import: dryRun flags duplicates per row (against DB and within the file);
  // real run creates rows, skipping duplicates unless skipDuplicates === false.
  if (body.action === 'bulk_add') {
    const digits = v => (v || '').replace(/\D/g, '')
    const existing = loadAll('contacts')
    const byEmail = new Map(existing.filter(x => x.email).map(x => [(x.email || '').trim().toLowerCase(), x]))
    const byPhone = new Map(existing.filter(x => digits(x.phone).length >= 7).map(x => [digits(x.phone), x]))
    const rows = Array.isArray(body.contacts) ? body.contacts : []
    if (body.dryRun) {
      const seenE = new Set(), seenP = new Set()
      const report = rows.map((r, index) => {
        const email = (r.email || '').trim().toLowerCase()
        const phone = digits(r.phone)
        const dup = (email && byEmail.get(email)) || (phone.length >= 7 && byPhone.get(phone)) || null
        const inFile = !dup && ((email && seenE.has(email)) || (phone.length >= 7 && seenP.has(phone)))
        if (email) seenE.add(email)
        if (phone.length >= 7) seenP.add(phone)
        return { index, duplicate: dup ? { id: dup.id, name: dup.name, email: dup.email || '', phone: dup.phone || '' } : null, inFileDuplicate: Boolean(inFile) }
      })
      return NextResponse.json({ ok: true, rows: report })
    }
    let added = 0, skipped = 0
    for (const r of rows) {
      const email = (r.email || '').trim().toLowerCase()
      const phone = digits(r.phone)
      const dup = (email && byEmail.get(email)) || (phone.length >= 7 && byPhone.get(phone)) || null
      if (dup && body.skipDuplicates !== false) { skipped++; continue }
      const rec = create('contacts', {
        name: (r.name || '').trim(), email: (r.email || '').trim(), phone: (r.phone || '').trim(),
        title: (r.title || '').trim(), accountId: r.accountId || null, notes: r.notes || '', tags: [], primary: false,
      })
      added++
      if (email) byEmail.set(email, rec)
      if (phone.length >= 7) byPhone.set(phone, rec)
    }
    return NextResponse.json({ ok: true, added, skipped })
  }

  if (body.action === 'bulk_delete') {
    removeMany('contacts', body.ids || [])
    return NextResponse.json({ ok: true })
  }

  // Promote a standalone contact into a full Account, link the contact to it.
  // Args: { id, accountName?, type?, notes? }
  // - accountName defaults to contact.name (the businessName, if you want a different
  //   one, pass it explicitly).
  // - The contact gets accountId = new account's id and primary = true.
  if (body.action === 'promote') {
    const contact = findById('contacts', body.id)
    if (!contact) return NextResponse.json({ error: 'contact not found' }, { status: 404 })
    if (contact.accountId) {
      const existing = findById('accounts', contact.accountId)
      if (existing) return NextResponse.json({ error: 'contact already linked to account', account: existing }, { status: 409 })
    }
    const account = create('accounts', {
      name: (body.accountName || contact.name || '').trim(),
      type: body.type || 'prospect',
      stage: body.stage || 'active',
      priority: body.priority || 'normal',
      website: body.website || '',
      industry: body.industry || '',
      email: contact.email || '',
      phone: contact.phone || '',
      notes: body.notes || contact.notes || '',
      tags: contact.tags || [],
      address: '',
    })
    const updatedContact = update('contacts', contact.id, { accountId: account.id, primary: true })
    return NextResponse.json({ ok: true, account, contact: updatedContact })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
