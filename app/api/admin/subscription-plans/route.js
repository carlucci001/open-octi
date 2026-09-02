import { NextResponse } from 'next/server'

import { requireOwner } from '@/lib/auth'
import { logAuditEvent } from '@/lib/auditLog'
import { mutateData, readData } from '@/lib/dataStore'
import { stripeBillingCatalogHash } from '@/lib/stripe-billing-catalog.mjs'
import { getRuntimeStripeBillingCatalogDefinitions } from '@/lib/stripe-billing-catalog-source'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FILE = 'pricing-tiers.json'
const ADDON_GROUPS = new Set(['tools', 'specialties', 'premiumModels'])

function json(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

function text(value, max = 300) {
  return String(value || '').trim().slice(0, max)
}

function id(value) {
  return text(value, 80).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function finite(value, { min, max, label }) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`)
  }
  return Math.round(number * 100) / 100
}

function whole(value, { min, max, label }) {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new Error(`${label} must be a whole number between ${min} and ${max}.`)
  }
  return number
}

function publicPlan(plan) {
  return {
    id: text(plan?.id, 80),
    name: text(plan?.name, 160),
    tagline: text(plan?.tagline, 300),
    monthlyFee: Number(plan?.monthlyFee || 0),
    color: /^#[0-9a-f]{6}$/i.test(plan?.color || '') ? plan.color : '#3b82f6',
    agents: Array.isArray(plan?.agents) ? plan.agents.map(value => text(value, 100)).filter(Boolean) : [],
    capabilities: Array.isArray(plan?.capabilities) ? plan.capabilities.map(value => text(value, 300)).filter(Boolean) : [],
    included: plan?.included && typeof plan.included === 'object' ? plan.included : {},
    creditAllowance: {
      includedCredits: Number(plan?.creditAllowance?.includedCredits || 0),
      rateVersion: text(plan?.creditAllowance?.rateVersion, 40),
      resetsWithPaidBillingPeriod: plan?.creditAllowance?.resetsWithPaidBillingPeriod !== false,
      exhaustionPolicy: text(plan?.creditAllowance?.exhaustionPolicy || 'prepaid_then_pause', 80),
    },
    overage: plan?.overage && typeof plan.overage === 'object' ? plan.overage : {},
    addons: Array.isArray(plan?.addons) ? plan.addons.map(value => text(value, 300)).filter(Boolean) : [],
    notes: text(plan?.notes, 1000),
  }
}

function publicAddon(addon, group) {
  return {
    id: text(addon?.id, 80),
    group,
    name: text(addon?.name, 160),
    monthlyFee: Number(addon?.monthlyFee || 0),
    description: text(addon?.description, 500),
    extraTools: Array.isArray(addon?.extraTools) ? addon.extraTools.map(value => text(value, 100)).filter(Boolean) : [],
  }
}

function pricingResponse(extra = {}) {
  const pricing = readData(FILE) || { tiers: [], addons: {} }
  const plans = (pricing.tiers || []).map(publicPlan)
  const addons = Object.entries(pricing.addons || {}).flatMap(([group, entries]) =>
    (Array.isArray(entries) ? entries : []).map(addon => publicAddon(addon, group)))
  let catalogHash = ''
  try { catalogHash = stripeBillingCatalogHash(getRuntimeStripeBillingCatalogDefinitions()) } catch {}
  return {
    ok: true,
    plans,
    addons,
    catalogHash,
    currency: text(pricing.currency || 'USD', 10),
    lastUpdated: text(pricing.lastUpdated, 80),
    ...extra,
  }
}

export async function GET(request) {
  const { error } = await requireOwner(request)
  if (error) return error
  return json(pricingResponse())
}

export async function POST(request) {
  const { user, error } = await requireOwner(request)
  if (error) return error
  const body = await request.json().catch(() => null)
  const action = text(body?.action, 60)
  const requestId = text(body?.requestId, 100).replace(/[^a-zA-Z0-9_-]/g, '')
  if (requestId.length < 8) return json({ ok: false, error: 'A valid request ID is required.' }, 400)

  if (action === 'bulk-delete' || action === 'bulk-copy') {
    const itemType = body?.itemType === 'addon' ? 'addon' : 'plan'
    const ids = [...new Set((Array.isArray(body?.ids) ? body.ids : []).map(value => text(value, 160)).filter(Boolean))].slice(0, 100)
    if (!ids.length) return json({ ok: false, error: 'Select at least one item.' }, 400)
    const changed = mutateData(FILE, current => {
      const data = current && typeof current === 'object' ? current : { tiers: [], addons: {} }
      if (itemType === 'plan') {
        const tiers = Array.isArray(data.tiers) ? [...data.tiers] : []
        const selected = tiers.filter(plan => ids.includes(plan.id))
        const next = action === 'bulk-delete'
          ? tiers.filter(plan => !ids.includes(plan.id))
          : [...tiers, ...selected.map(plan => ({ ...plan, id: `${plan.id}-copy-${Date.now().toString(36)}`, name: `${plan.name} Copy` }))]
        return { data: { ...data, tiers: next, lastUpdated: new Date().toISOString() }, result: selected.length }
      }
      const groups = { ...(data.addons || {}) }
      let count = 0
      for (const [group, entries] of Object.entries(groups)) {
        const list = Array.isArray(entries) ? [...entries] : []
        const selected = list.filter(addon => ids.includes(`${group}:${addon.id}`))
        count += selected.length
        groups[group] = action === 'bulk-delete'
          ? list.filter(addon => !ids.includes(`${group}:${addon.id}`))
          : [...list, ...selected.map(addon => ({ ...addon, id: `${addon.id}-copy-${Date.now().toString(36)}`, name: `${addon.name} Copy` }))]
      }
      return { data: { ...data, addons: groups, lastUpdated: new Date().toISOString() }, result: count }
    })
    try {
      logAuditEvent({ request, user, action: `subscription_${itemType}_${action.replace('bulk-', 'bulk_')}`, area: 'billing', severity: action === 'bulk-delete' ? 'warning' : 'info', meta: { requestId, ids, count: changed, stripeSyncRequired: true } })
    } catch {}
    return json(pricingResponse({ bulkAction: action, affected: changed, stripeSyncRequired: true }))
  }

  if (action === 'upsert-plan') {
    const planId = id(body?.plan?.id || body?.plan?.name)
    const name = text(body?.plan?.name, 160)
    if (!planId || planId.length < 2) return json({ ok: false, error: 'Plan ID is required.' }, 400)
    if (name.length < 2) return json({ ok: false, error: 'Plan name is required.' }, 400)
    let monthlyFee
    let includedCredits
    try {
      monthlyFee = finite(body?.plan?.monthlyFee, { min: 0, max: 1_000_000, label: 'Monthly fee' })
      includedCredits = whole(Number(body?.plan?.includedCredits), { min: 0, max: 1_000_000_000, label: 'Included credits' })
    } catch (validationError) {
      return json({ ok: false, error: validationError.message }, 400)
    }

    let created = false
    const saved = mutateData(FILE, current => {
      const data = current && typeof current === 'object' ? current : { tiers: [], addons: {} }
      const tiers = Array.isArray(data.tiers) ? [...data.tiers] : []
      const index = tiers.findIndex(plan => plan.id === planId)
      const existing = index >= 0 ? tiers[index] : null
      created = !existing
      const next = {
        ...(existing || {}),
        id: planId,
        name,
        tagline: text(body?.plan?.tagline, 300),
        monthlyFee,
        color: /^#[0-9a-f]{6}$/i.test(body?.plan?.color || '') ? body.plan.color : existing?.color || '#3b82f6',
        agents: existing?.agents || [],
        capabilities: String(body?.plan?.capabilities || '')
          .split(/\r?\n/)
          .map(value => text(value, 300))
          .filter(Boolean),
        included: existing?.included || {},
        creditAllowance: {
          ...(existing?.creditAllowance || {}),
          includedCredits,
          rateVersion: new Date().toISOString().slice(0, 10),
          resetsWithPaidBillingPeriod: true,
          exhaustionPolicy: 'prepaid_then_pause',
        },
        overage: existing?.overage || {},
        addons: existing?.addons || [],
        notes: text(body?.plan?.notes, 1000),
      }
      if (index >= 0) tiers[index] = next
      else tiers.push(next)
      const updated = { ...data, tiers, lastUpdated: new Date().toISOString() }
      return { data: updated, result: publicPlan(next) }
    })

    try {
      logAuditEvent({
        request,
        user,
        action: created ? 'subscription_plan_created' : 'subscription_plan_updated',
        area: 'billing',
        severity: 'info',
        targetId: saved.id,
        targetName: saved.name,
        meta: { requestId, monthlyFee, includedCredits, stripeSyncRequired: true },
      })
    } catch {}
    return json(pricingResponse({ saved: { type: 'plan', created, item: saved }, stripeSyncRequired: true }))
  }

  if (action === 'upsert-addon') {
    const group = text(body?.addon?.group, 40)
    const addonId = id(body?.addon?.id || body?.addon?.name)
    const name = text(body?.addon?.name, 160)
    if (!ADDON_GROUPS.has(group)) return json({ ok: false, error: 'Choose a supported add-on group.' }, 400)
    if (!addonId || addonId.length < 2) return json({ ok: false, error: 'Add-on ID is required.' }, 400)
    if (name.length < 2) return json({ ok: false, error: 'Add-on name is required.' }, 400)
    let monthlyFee
    try {
      monthlyFee = finite(body?.addon?.monthlyFee, { min: -1_000_000, max: 1_000_000, label: 'Monthly fee' })
    } catch (validationError) {
      return json({ ok: false, error: validationError.message }, 400)
    }

    let created = false
    const saved = mutateData(FILE, current => {
      const data = current && typeof current === 'object' ? current : { tiers: [], addons: {} }
      const groups = { ...(data.addons || {}) }
      const entries = Array.isArray(groups[group]) ? [...groups[group]] : []
      const index = entries.findIndex(addon => addon.id === addonId)
      const existing = index >= 0 ? entries[index] : null
      created = !existing
      const next = {
        ...(existing || {}),
        id: addonId,
        name,
        monthlyFee,
        description: text(body?.addon?.description, 500),
      }
      if (index >= 0) entries[index] = next
      else entries.push(next)
      groups[group] = entries
      const updated = { ...data, addons: groups, lastUpdated: new Date().toISOString() }
      return { data: updated, result: publicAddon(next, group) }
    })

    try {
      logAuditEvent({
        request,
        user,
        action: created ? 'subscription_addon_created' : 'subscription_addon_updated',
        area: 'billing',
        severity: 'info',
        targetId: saved.id,
        targetName: saved.name,
        meta: { requestId, group, monthlyFee, stripeSyncRequired: true },
      })
    } catch {}
    return json(pricingResponse({ saved: { type: 'addon', created, item: saved }, stripeSyncRequired: true }))
  }

  return json({ ok: false, error: 'Unknown subscription plan action.' }, 400)
}
