import { NextResponse } from 'next/server'
import { getCred } from '@/lib/agent-creds'
import { readData, writeData } from '@/lib/dataStore'
import { findById, update } from '@/lib/entityStore'
import { requireCrmWrite } from '@/lib/permissions'

const PHONE_RE = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/
const URL_RE = /https?:\/\/[^\s,)"'\]]+/i

function parseProviderJson(text, provider) {
  try {
    return JSON.parse(text || '{}')
  } catch {
    const html = /^\s*<!doctype html/i.test(text || '') || /^\s*<html/i.test(text || '')
    throw new Error(`${provider} returned ${html ? 'HTML' : 'invalid JSON'} instead of API data`)
  }
}

async function ask(key, prompt, maxTokens = 160) {
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'sonar',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(15000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Perplexity ${res.status}: ${text.slice(0, 200)}`)
  const data = parseProviderJson(text, 'Perplexity')
  return data.choices?.[0]?.message?.content || ''
}

function clean(url) {
  if (!url) return ''
  return url.replace(/\[\d+\]/g, '').replace(/[.)\]]+$/, '').trim()
}

function findSponsorLead(id) {
  const entity = findById('leads', id)
  if (entity) {
    return {
      arr: null,
      idx: -1,
      entity,
      lead: {
        id: entity.id,
        bn: entity.businessName || '',
        cn: entity.name || '',
        ph: entity.phone || '',
        em: entity.email || '',
        web: entity.website || entity.web || '',
        address: entity.address || '',
        paperCity: entity.legacy?.paperCity || '',
        paperState: entity.legacy?.paperState || '',
        researchSummary: entity.researchSummary || entity.legacy?.researchSummary || '',
      },
    }
  }
  const raw = readData('sponsor-leads.json')
  const arr = Array.isArray(raw) ? raw : raw?.leads || []
  const idx = arr.findIndex(l => l.id === id)
  return { arr, idx, entity: null, lead: arr[idx] }
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  const { leadId, lead: draftLead, fields = ['phone', 'website', 'address', 'summary'] } = await request.json().catch(() => ({}))
  const cred = getCred('perplexity')
  if (!cred?.key) return NextResponse.json({ error: 'No Perplexity API key in credentials vault' }, { status: 400 })

  const { arr, idx, entity, lead: savedLead } = findSponsorLead(leadId)
  const lead = savedLead || draftLead
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  const name = lead.bn || ''
  const where = lead.address || lead.paperCity || lead.paperState || 'Asheville NC'
  const updates = {}
  const found = {}

  try {
    if (fields.includes('phone') && !lead.ph) {
      const r = await ask(cred.key, `Phone number for ${name} at ${where}? Reply with ONLY the phone in (XXX) XXX-XXXX format. If unknown, reply NONE.`)
      const m = r.match(PHONE_RE); if (m) { updates.ph = m[0]; found.phone = m[0] }
    }
    if (fields.includes('website') && !lead.web) {
      const r = await ask(cred.key, `Website URL for ${name} at ${where}? Reply with ONLY the full URL starting with https://. If none, reply NONE.`)
      const m = r.match(URL_RE); if (m) { updates.web = clean(m[0]); found.website = clean(m[0]) }
    }
    if (fields.includes('address') && !lead.address) {
      const r = await ask(cred.key, `Street address for ${name} in ${where}? Reply with ONLY the full street address, city, state, zip. If unknown, reply NONE.`)
      if (!/none|unknown/i.test(r.trim())) { updates.address = r.trim().split('\n')[0]; found.address = updates.address }
    }
    if (fields.includes('summary')) {
      const r = await ask(cred.key, `In 2-3 sentences, describe ${name}${where ? ' in ' + where : ''} — what they sell, their target customer, and any notable recent news. Skip filler.`, 200)
      if (r.trim()) { updates.researchSummary = r.trim(); found.summary = updates.researchSummary }
    }
  } catch (e) {
    return NextResponse.json({ error: e.message, partial: found }, { status: 502 })
  }

  if (Object.keys(updates).length > 0 && entity) {
    const legacy = { ...(entity.legacy || {}) }
    if (updates.researchSummary) legacy.researchSummary = updates.researchSummary
    update('leads', entity.id, {
      phone: updates.ph || entity.phone,
      website: updates.web || entity.website,
      address: updates.address || entity.address,
      researchSummary: updates.researchSummary || entity.researchSummary,
      legacy,
    })
  } else if (Object.keys(updates).length > 0 && arr && idx >= 0) {
    updates.lc = new Date().toISOString()
    arr[idx] = { ...lead, ...updates }
    writeData('sponsor-leads.json', arr)
  }

  return NextResponse.json({ ok: true, found, updated: Object.keys(updates) })
}

export async function GET() {
  return NextResponse.json({ ok: false, error: 'POST required' }, { status: 405 })
}
