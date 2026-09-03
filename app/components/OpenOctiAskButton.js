'use client'
import { MessageCircle } from 'lucide-react'
import { useEffect, useState } from 'react'

export default function OpenOctiAskButton() {
  const [enabled, setEnabled] = useState(false)
  const refresh = () => fetch('/api/platform-admin/v1/capabilities', { cache: 'no-store' }).then(response => response.json()).then(data => setEnabled((data.capabilities || []).some(item => ['anthropic', 'openai', 'gemini', 'openrouter'].includes(item.id) && item.status === 'configured'))).catch(() => {})
  useEffect(() => {
    refresh()
    const timer = new URLSearchParams(window.location.search).get('ask') === 'octi' ? window.setTimeout(() => window.dispatchEvent(new CustomEvent('openocti:ask', { detail: {} })), 500) : null
    window.addEventListener('openocti:key-saved', refresh)
    return () => { if (timer) window.clearTimeout(timer); window.removeEventListener('openocti:key-saved', refresh) }
  }, [])
  const open = () => { if (!enabled) window.location.assign('/settings/models'); else window.dispatchEvent(new CustomEvent('openocti:ask', { detail: {} })) }
  return <button type="button" onClick={open} title={enabled ? 'Ask Octi' : 'Octi needs a model key — open Models & Keys'} className="inline-flex items-center gap-2 rounded-lg px-3 font-semibold" style={{ minHeight: 34, color: enabled ? 'var(--text)' : 'var(--text-muted)', border: '1px solid var(--border)', background: 'var(--surface2)' }}><MessageCircle size={16} /> Ask Octi</button>
}
