import { NextResponse } from 'next/server'
import { listFarringtonLeadVerticals, runFarringtonLeadSweep } from '@/lib/apify-farrington-lead-sweep'
import { createSweepRunOnce, finishSweepRun, getSweepRun, reportSweepProgress } from '@/lib/lead-sweep-runs'
import { normalizeLeadClientRequestId } from '@/lib/lead-run-client'
import { buildLeadVendorRequest } from '@/lib/lead-paid-search-limit'
import { resolveLeadListForDestination } from '@/lib/lead-list-routing'
import { loadLeadLists } from '@/lib/leadLists'
import { requireCrmWrite } from '@/lib/permissions'
import { resolveLeadSources } from '@/lib/lead-signals/resolver'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    ok: true,
    verticals: listFarringtonLeadVerticals().map(v => ({
      id: v.id,
      rank: v.rank,
      label: v.label,
      serviceLine: v.serviceLine,
      offer: v.offer,
      caveat: v.caveat,
      leadWith: v.leadWith,
    })),
  })
}

// A sweep takes minutes: the Places actor alone allows 240s, the contact
// scraper 150s, then a website read per lead. Cloudflare severs the origin
// connection at 100s, so holding the socket open returned a gateway 5xx to the
// browser while the server quietly finished and created the leads anyway.
// POST now starts the work and returns a run record; the client polls
// /api/leads/sweep-runs?id=<runId> for progress and the final result.
export async function POST(request) {
  const { user, error } = await requireCrmWrite(request)
  if (error) return error

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const category = String(body.category || body.verticalId || '').trim()
  if (!category) {
    return NextResponse.json({ ok: false, error: 'Category is required' }, { status: 400 })
  }

  const clientRequestId = normalizeLeadClientRequestId(body.clientRequestId)
  const requestedVendor = body.vendor && typeof body.vendor === 'object' && !Array.isArray(body.vendor)
    ? body.vendor
    : undefined
  const vendorOverrides = requestedVendor || {}
  const vendor = {
    ...vendorOverrides,
    ...buildLeadVendorRequest(
      vendorOverrides.provider || process.env.LEAD_VENDOR_PROVIDER || 'apify',
      vendorOverrides.maxPaidBatches ?? process.env.LEAD_PEOPLE_MAX_PAID_SEARCHES,
    ),
  }
  const destination = String(body.spec?.destination || body.form?.destination || 'farrington_dev').trim()
  const provenOnly = body.provenOnly === true
  let provenResolution = null
  if (provenOnly) {
    const requestedSourceIds = [...new Set((Array.isArray(body.provenSourceIds) ? body.provenSourceIds : []).map(String).filter(Boolean))]
    if (!requestedSourceIds.length) {
      return NextResponse.json({ ok: false, error: 'At least one proven source is required' }, { status: 400 })
    }
    provenResolution = resolveLeadSources({ leadType: category, location: body.location || 'United States' })
    const allowed = new Map((provenResolution.sources || []).map(source => [source.id, source]))
    const rejected = requestedSourceIds.filter(id => !allowed.has(id))
    if (rejected.length) {
      return NextResponse.json({ ok: false, error: `Source is not proven for this lead type and jurisdiction: ${rejected.join(', ')}` }, { status: 400 })
    }
    provenResolution.sources = requestedSourceIds.map(id => allowed.get(id))
  }
  const selectedLeadList = resolveLeadListForDestination({
    destination,
    leadLists: loadLeadLists(),
    requestedId: body.leadListId || body.form?.selectedLeadListId,
    allowAnyRequested: true,
  })
  const dataSource = {
    category,
    verticalId: body.verticalId || category,
    location: body.location || 'United States',
    limit: body.limit || 10,
    query: body.query,
    campaign: body.campaign,
    // The Leads Lab list picker — without this the sweep created leads with
    // no lead list and they landed under "No lead list" (found 2026-08-14).
    leadListId: selectedLeadList?.id || undefined,
    spec: body.spec,
    signalOptions: body.signalOptions && typeof body.signalOptions === 'object' ? body.signalOptions : body.form?.signalOptions,
    // Per-run vendor choice: { provider: 'apollo' } sources named decision-makers
    // from Apollo instead of businesses from Google Places. Omitted, the
    // env default (apify/Places) applies exactly as before.
    vendor,
    ...(provenOnly ? { enrichContacts: false, nameEnrich: { enabled: false } } : {}),
  }

  const startedBy = user?.email || user?.name || 'operator'
  const { run, created } = createSweepRunOnce({
    kind: 'vertical',
    stepsTotal: 5,
    startedBy,
    params: {
      category,
      location: dataSource.location,
      limit: dataSource.limit,
      campaign: body.campaign || null,
      provider: dataSource.vendor?.provider || 'apify',
      maxPaidBatches: dataSource.vendor?.maxPaidBatches || 1,
      clientRequestId: clientRequestId || null,
      // Replay metadata: the exact Leads Lab form state behind this run, so
      // "Run again" can restore it. Never read by the pipeline.
      form: body.form && typeof body.form === 'object' && !Array.isArray(body.form) ? body.form : null,
      ...(provenOnly ? { provenOnly: true, provenSourceIds: provenResolution.sources.map(source => source.id) } : {}),
    },
  })

  if (!created) {
    console.log(`[leads-lab] replay request=${clientRequestId} run=${run.id} kind=vertical status=${run.status}`)
    return NextResponse.json({ ok: true, run, replayed: true })
  }

  console.log(`[leads-lab] accepted request=${clientRequestId || 'none'} run=${run.id} kind=vertical provider=${dataSource.vendor?.provider || 'apify'}`)

  // Fire and forget. This is a long-lived node server (systemd
  // farrington-crm.service), so the promise outlives the response; every
  // outcome, including a throw, lands in the run record.
  runFarringtonLeadSweep({
    dataSource,
    delivery: { recipients: body.recipientEmail ? [body.recipientEmail] : [] },
  }, {
    recipientEmail: body.recipientEmail,
    ...(provenOnly ? {
      provenOnly: true,
      resolvedSignalSources: provenResolution.sources,
      signalJurisdiction: provenResolution.jurisdiction,
    } : {}),
    onProgress: update => reportSweepProgress(run.id, update),
  })
    .then(result => {
      const finished = finishSweepRun(run.id, { status: 'completed', result })
      console.log(`[leads-lab] completed request=${clientRequestId || 'none'} run=${run.id} kind=vertical created=${Number(result?.created || 0)} returned=${Number(result?.returned || 0)} persisted=${Boolean(finished)}`)
      return finished
    })
    .catch(err => {
      const message = err?.message || 'Lead sweep failed'
      const finished = finishSweepRun(run.id, { status: 'failed', error: message })
      console.error(`[leads-lab] failed request=${clientRequestId || 'none'} run=${run.id} kind=vertical persisted=${Boolean(finished)} error=${message}`)
      return finished
    })
    // Terminal guard: nothing beyond this point may reject unhandled.
    .catch(() => {})

  // Brief grace period so the client's first render usually shows real progress
  // rather than a bare "Starting run...".
  await new Promise(resolve => setTimeout(resolve, 250))

  return NextResponse.json({ ok: true, run: getSweepRun(run.id) || run }, { status: 202 })
}
