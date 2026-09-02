import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { readData, writeData } from '@/lib/dataStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FILE = 'interface-settings.json'
const VALID_THEMES = new Set(['command', 'codex', 'codex-blue'])
const LEGACY_THEME_MAP = {
  light: 'codex',
  operator: 'codex',
  dark: 'command',
  'operator-dark': 'command',
  'codex-dark': 'command',
  anthropic: 'codex',
}
const DEFAULTS = {
  theme: 'command',
}

function normalizeTheme(theme) {
  if (VALID_THEMES.has(theme)) return theme
  return LEGACY_THEME_MAP[theme] || DEFAULTS.theme
}

function normalize(settings) {
  const theme = normalizeTheme(settings?.theme)
  return { ...DEFAULTS, ...(settings || {}), theme }
}

export async function GET() {
  return NextResponse.json({ ok: true, settings: normalize(readData(FILE)) })
}

export async function POST(request) {
  const { error } = await requireAdmin(request)
  if (error) return error

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 })
  }

  const current = normalize(readData(FILE))
  const nextTheme = body?.theme
  if (!VALID_THEMES.has(nextTheme)) {
    return NextResponse.json({ ok: false, error: 'invalid theme' }, { status: 400 })
  }

  const settings = {
    ...current,
    theme: nextTheme,
    updatedAt: new Date().toISOString(),
  }
  writeData(FILE, settings)

  return NextResponse.json({ ok: true, settings })
}
