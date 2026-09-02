import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getTunnelBaseUrl() {
  try {
    return readFileSync(join(process.cwd(), 'data/tunnel-logs/tunnel-url.txt'), 'utf8').trim().replace(/\/$/, '')
  } catch { return null }
}

// Twilio hits this when the outbound (destination) leg answers.
// Joins them into the named conference with silence instead of hold music.
export async function GET(request) { return handle(request) }
export async function POST(request) { return handle(request) }

async function handle(request) {
  const url = new URL(request.url)
  const baseUrl = getTunnelBaseUrl() || `${url.protocol}//${url.host}`
  let conf = url.searchParams.get('conf')

  if (!conf && request.method === 'POST') {
    const ct = request.headers.get('content-type') || ''
    if (ct.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(await request.text())
      conf = params.get('conf') || params.get('FriendlyName')
    }
  }

  if (!conf) {
    return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`, {
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    })
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference beep="false" startConferenceOnEnter="true" endConferenceOnExit="true" waitUrl="${baseUrl}/api/twilio/wait">${conf}</Conference>
  </Dial>
</Response>`

  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml; charset=utf-8' } })
}
