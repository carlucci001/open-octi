// Lead follow-up email templates — editable, kv_store-backed.
//
// These letters used to be hardcoded inside LeadsManager's leadEmailDraft()
// with readOnly subject/body fields, which meant editing a follow-up letter
// required a code deploy. Carl edits letters between calls, not between
// deploys — so they live in data now, same pattern as /api/scripts.
//
// Template variables, substituted at compose time by the client:
//   {contact}  → lead.name        (fallback "there")
//   {company}  → lead.businessName (fallback "your team")
//   {brand}    → sending brand label
//
// GET  → { templates: [...] }   (seeds from the original hardcoded letters on
//                                first read, so day one looks identical)
// POST { action: 'save',   template } → update one template in place
// POST { action: 'create', template? } → new template (defaults + overrides)
// POST { action: 'delete', id }
import { NextResponse } from 'next/server'
import { readData, writeData } from '@/lib/dataStore'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FILE = 'email-templates.json'

// Seeds reproduce leadEmailDraft() exactly as of 2026-08-10 — the letters Carl
// has been sending. Editing any of these in the UI persists to kv_store; this
// list is only consulted when the store is empty.
const SEED_TEMPLATES = [
  {
    id: 'fd-first-reply',
    name: 'First reply',
    brandContext: 'farrington_dev',
    subject: 'Following up with {company}',
    body: 'Hi {contact},\n\nI wanted to follow up from Farrington Development and make sure we have the right next step for {company}.\n\nBased on what I have so far, this looks like it may fit a consulting, automation, web, CRM, or AI workflow conversation. I can help define the scope, budget, and timeline before anyone invests time in the wrong direction.\n\nIf you are open to it, the best next step is a short conversation so I can confirm money, authority, and need, then give you a practical recommendation.\n\nCarl Farrington\nFarrington Development',
  },
  {
    id: 'fd-proposal-next-step',
    name: 'Proposal next step',
    brandContext: 'farrington_dev',
    subject: 'Farrington Development next step for {company}',
    body: 'Hi {contact},\n\nI wanted to follow up from Farrington Development and make sure we have the right next step for {company}.\n\nBased on what I have so far, this looks like it may fit a consulting, automation, web, CRM, or AI workflow conversation. I can help define the scope, budget, and timeline before anyone invests time in the wrong direction.\n\nIf you are open to it, the best next step is a short conversation so I can confirm money, authority, and need, then give you a practical recommendation.\n\nCarl Farrington\nFarrington Development',
  },
  {
    id: 'nra-first-reply',
    name: 'First reply',
    brandContext: 'newsroomaios',
    subject: 'NewsroomAIOS next step for {company}',
    body: 'Hi {contact},\n\nThanks for taking a look at NewsroomAIOS. I wanted to follow up with a clear next step for {company} and see whether a short demo would help you evaluate the platform.\n\nNewsroomAIOS is built to help local publishers create, manage, and monetize modern community news operations with AI-assisted workflows, voice agents, media tools, and sponsor-ready publishing infrastructure.\n\nIf it makes sense, I can walk you through the fit, setup path, and practical numbers.\n\nCarl Farrington\nNewsroomAIOS',
  },
  {
    id: 'nra-demo-followup',
    name: 'Demo follow-up',
    brandContext: 'newsroomaios',
    subject: 'NewsroomAIOS follow-up for {company}',
    body: 'Hi {contact},\n\nThanks for taking a look at NewsroomAIOS. I wanted to follow up with a clear next step for {company} and see whether a short demo would help you evaluate the platform.\n\nNewsroomAIOS is built to help local publishers create, manage, and monetize modern community news operations with AI-assisted workflows, voice agents, media tools, and sponsor-ready publishing infrastructure.\n\nIf it makes sense, I can walk you through the fit, setup path, and practical numbers.\n\nCarl Farrington\nNewsroomAIOS',
  },
  {
    id: 'wnc-first-reply',
    name: 'First reply',
    brandContext: 'wnc_times',
    subject: 'WNC Times opportunity for {company}',
    body: 'Hi {contact},\n\nI wanted to reach out from WNC Times about a possible local media, coverage, or partnership opportunity for {company}.\n\nIf this is worth exploring, I can send over the right next step and keep it simple.\n\nCarl Farrington\nWNC Times',
  },
]

function seed() {
  const templates = SEED_TEMPLATES.map(t => ({ ...t, updatedAt: new Date().toISOString() }))
  writeData(FILE, { templates })
  return templates
}

function getTemplates() {
  const data = readData(FILE)
  const templates = Array.isArray(data) ? data : data?.templates
  if (!Array.isArray(templates) || templates.length === 0) return seed()
  return templates
}

function putTemplates(templates) {
  writeData(FILE, { templates, lastUpdated: new Date().toISOString() })
}

const clean = (v) => String(v ?? '')

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  try {
    return NextResponse.json({ templates: getTemplates() })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  try {
    const body = await request.json()
    let templates = getTemplates()

    if (body.action === 'save') {
      const t = body.template || {}
      if (!t.id) return NextResponse.json({ error: 'template.id required' }, { status: 400 })
      let found = false
      templates = templates.map(existing => {
        if (existing.id !== t.id) return existing
        found = true
        return {
          ...existing,
          name: clean(t.name ?? existing.name),
          brandContext: clean(t.brandContext ?? existing.brandContext),
          subject: clean(t.subject ?? existing.subject),
          body: clean(t.body ?? existing.body),
          updatedAt: new Date().toISOString(),
        }
      })
      if (!found) return NextResponse.json({ error: 'template not found' }, { status: 404 })
      putTemplates(templates)
      return NextResponse.json({ ok: true, templates })
    }

    if (body.action === 'create') {
      const t = body.template || {}
      const template = {
        id: `tpl-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        name: clean(t.name) || 'New template',
        brandContext: clean(t.brandContext) || 'farrington_dev',
        subject: clean(t.subject) || 'Following up with {company}',
        body: clean(t.body) || 'Hi {contact},\n\n\n\nCarl Farrington\n{brand}',
        updatedAt: new Date().toISOString(),
      }
      templates.push(template)
      putTemplates(templates)
      return NextResponse.json({ ok: true, template, templates })
    }

    if (body.action === 'delete') {
      const before = templates.length
      templates = templates.filter(t => t.id !== body.id)
      if (templates.length === before) return NextResponse.json({ error: 'template not found' }, { status: 404 })
      putTemplates(templates)
      return NextResponse.json({ ok: true, templates })
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
