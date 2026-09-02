// Fire-and-forget push notifications to Carl's phone via ntfy.sh.
// Topic defaults to the prod watchdog topic; override with NTFY_TOPIC.
// Never throws — inbound ingestion must not fail because a push failed.
const DEFAULT_TOPIC = 'openocti-alerts'

export async function pushNtfy({ title, body = '', priority = 'default', tags = [] } = {}) {
  if (!title) return { ok: false, skipped: 'no_title' }
  const topic = (process.env.NTFY_TOPIC || DEFAULT_TOPIC).trim()
  if (!topic) return { ok: false, skipped: 'no_topic' }
  try {
    const response = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: 'POST',
      headers: {
        Title: String(title).replace(/[^\x20-\x7E]/g, '').slice(0, 250),
        Priority: String(priority),
        Tags: Array.isArray(tags) ? tags.join(',') : String(tags || ''),
      },
      body: String(body).slice(0, 4000),
      signal: AbortSignal.timeout(5000),
    })
    return { ok: response.ok, status: response.status }
  } catch (error) {
    console.error('[ntfy] push failed:', error?.message)
    return { ok: false, error: error?.message }
  }
}
