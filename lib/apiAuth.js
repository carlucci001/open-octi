import { NextResponse } from 'next/server'

const API_KEY = process.env.OPENCLAW_API_KEY

export function validateApiKey(request) {
  if (!API_KEY) return { ok: false, response: NextResponse.json({ error: 'OPENCLAW_API_KEY not configured' }, { status: 500 }) }
  const key = request.headers.get('x-api-key')
  if (key !== API_KEY) return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  return { ok: true }
}
