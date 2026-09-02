import { NextResponse } from 'next/server'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { requireCrmRead } from '@/lib/permissions'

export const runtime = 'nodejs'

const execFileAsync = promisify(execFile)
const VALID_CHANNELS = new Set(['telegram', 'discord'])

const CHANNEL_PATTERNS = {
  telegram: /telegram|carluccibot/i,
  discord: /discord|open claw|gateway\.discord|guild|channel/i,
}

function redact(text = '') {
  return String(text)
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\b\d{6,}:[A-Za-z0-9_-]{24,}\b/g, '[REDACTED_TELEGRAM_BOT_TOKEN]')
    .replace(/https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/gi, '[REDACTED_DISCORD_WEBHOOK]')
    .replace(/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b/g, '[REDACTED_KEY]')
    .replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, '[REDACTED_OPENAI_KEY]')
    .replace(/\bnyk_[A-Za-z0-9_-]{20,}\b/gi, '[REDACTED_NYLAS_KEY]')
    .replace(/\b(token|secret|password|api[_-]?key)=\S+/gi, '$1=[REDACTED]')
}

async function runCommand(file, args, timeout = 8000) {
  try {
    const { stdout, stderr } = await execFileAsync(file, args, {
      timeout,
      maxBuffer: 1024 * 256,
      windowsHide: true,
    })
    return { ok: true, output: redact(`${stdout || ''}${stderr ? `\n${stderr}` : ''}`) }
  } catch (error) {
    return { ok: false, output: redact(`${error.stdout || ''}${error.stderr || ''}`), error: error.message }
  }
}

function parseStatus(output = '') {
  const channels = {}
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim()
    const match = line.match(/^-\s*(Discord|Telegram)\s+default:\s*(.+)$/i)
    if (!match) continue
    const id = match[1].toLowerCase()
    const detail = match[2]
    channels[id] = {
      id,
      detail,
      enabled: /enabled/i.test(detail),
      configured: /configured/i.test(detail),
      running: /running/i.test(detail),
      connected: /connected/i.test(detail),
      works: /\bworks\b/i.test(detail),
      bot: detail.match(/bot:([^,\s]+)/i)?.[1] || '',
      tokenSource: detail.match(/token:([^,\s]+)/i)?.[1] || '',
    }
  }
  return channels
}

function parseEvents(output = '', channel) {
  const pattern = CHANNEL_PATTERNS[channel] || /telegram|discord/i
  return output
    .split(/\r?\n/)
    .map(line => redact(line).trim())
    .filter(Boolean)
    .filter(line => pattern.test(line))
    .slice(-80)
    .reverse()
    .map((line, index) => {
      const match = line.match(/^(\d{4}-\d{2}-\d{2}T[^\s]+)\s+\S+\s+(.+)$/)
      return {
        id: `${channel}-${index}`,
        at: match?.[1] || '',
        text: match?.[2] || line,
      }
    })
}

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error

  const { searchParams } = new URL(request.url)
  const requested = String(searchParams.get('channel') || 'telegram').toLowerCase()
  const channel = VALID_CHANNELS.has(requested) ? requested : 'telegram'

  const statusResult = await runCommand('openclaw', ['channels', 'status', '--probe'], 12000)
  const journalResult = process.platform === 'win32'
    ? { ok: false, output: '', error: 'journal unavailable on Windows local preview' }
    : await runCommand('journalctl', ['-u', 'openclaw-gateway.service', '--since', '24 hours ago', '-n', '260', '--no-pager', '-o', 'short-iso'], 10000)

  const channels = parseStatus(statusResult.output)
  const selected = channels[channel] || {
    id: channel,
    detail: statusResult.ok ? 'No status line reported for this channel.' : statusResult.error || 'Status unavailable.',
    enabled: false,
    configured: false,
    running: false,
    connected: false,
    works: false,
    bot: '',
    tokenSource: '',
  }

  return NextResponse.json({
    ok: true,
    channel,
    generatedAt: new Date().toISOString(),
    selected,
    channels,
    events: parseEvents(journalResult.output, channel),
    diagnostics: {
      statusOk: statusResult.ok,
      journalOk: journalResult.ok,
      journalError: journalResult.ok ? '' : journalResult.error,
    },
    accessNote: 'Shows bot-visible OpenClaw channel status and gateway activity. It does not log into, mirror, or expose a personal Telegram or Discord user account.',
  })
}
