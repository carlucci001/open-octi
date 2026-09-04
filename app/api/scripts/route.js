import { NextResponse } from 'next/server'
import { readData, writeData } from '@/lib/dataStore'
import { DEFAULT_SCRIPTS, NEWSPAPER_SCRIPTS, TDA_SCRIPTS, DEV_SCRIPTS, CAMPAIGN_SCRIPTS } from '@/lib/sponsor-scripts'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function seed() {
  const all = [
    ...DEFAULT_SCRIPTS.map(s => ({ ...s, campaign: 'sponsors' })),
    ...NEWSPAPER_SCRIPTS.map(s => ({ ...s, campaign: 'newspapers' })),
    ...TDA_SCRIPTS.map(s => ({ ...s, campaign: 'tda_outreach' })),
    ...DEV_SCRIPTS.map(s => ({ ...s, campaign: 'farrington_dev' })),
    ...CAMPAIGN_SCRIPTS.map(s => ({ ...s, campaign: 'campaigns' })),
  ]
  writeData('scripts.json', all)
  return all
}

function getScripts() {
  const data = readData('scripts.json')
  if (!data || !Array.isArray(data) || data.length === 0) return seed()
  const campaignDefaults = CAMPAIGN_SCRIPTS.map(s => ({ ...s, campaign: 'campaigns' }))
  const missing = campaignDefaults.filter(defaultScript => !data.some(script => script.id === defaultScript.id))
  if (!missing.length) return data
  const merged = [...data, ...missing]
  writeData('scripts.json', merged)
  return merged
}

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  try {
    return NextResponse.json(getScripts())
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  try {
    const body = await request.json()
    let scripts = getScripts()

    if (body.action === 'save') {
      scripts = scripts.map(s => s.id === body.script.id ? { ...s, ...body.script } : s)
      writeData('scripts.json', scripts)
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'create') {
      const existing = scripts.filter(s => s.campaign === body.campaign)
      const tag = String.fromCharCode(65 + existing.length)
      const newScript = {
        id: `${body.campaign}-script-${Date.now()}`,
        name: 'New Script',
        tag,
        campaign: body.campaign,
        description: '',
        sections: [{ heading: 'Opening', lines: [''] }],
        objections: [],
        stats: { calls: 0, interested: 0, closed: 0 },
        active: true,
      }
      scripts.push(newScript)
      writeData('scripts.json', scripts)
      return NextResponse.json({ ok: true, script: newScript })
    }

    if (body.action === 'delete') {
      scripts = scripts.filter(s => s.id !== body.id)
      writeData('scripts.json', scripts)
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'reset-stats') {
      scripts = scripts.map(s => s.id === body.id
        ? { ...s, stats: { calls: 0, interested: 0, closed: 0 } }
        : s)
      writeData('scripts.json', scripts)
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'toggle') {
      scripts = scripts.map(s => s.id === body.id ? { ...s, active: !s.active } : s)
      writeData('scripts.json', scripts)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
