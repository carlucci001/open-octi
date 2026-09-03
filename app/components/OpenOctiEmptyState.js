'use client'
import Link from 'next/link'
import { MessageCircle, Upload } from 'lucide-react'

export default function OpenOctiEmptyState({ objectType, title, description }) {
  const ask = () => window.dispatchEvent(new CustomEvent('openocti:ask', { detail: { prompt: `Help me add my first ${objectType}.` } }))
  return <div className="rounded-xl p-8 text-center" style={{ background: 'var(--surface)', border: '1px dashed var(--border)' }}><h3 className="font-semibold">{title}</h3><p className="text-sm mt-2 mx-auto" style={{ color: 'var(--text-muted)', maxWidth: 520 }}>{description}</p><div className="mt-4 flex justify-center gap-2 flex-wrap"><Link href={`/settings/import?type=${encodeURIComponent(objectType)}`} className="inline-flex items-center gap-2 rounded-lg px-4 font-semibold" style={{ minHeight: 44, background: 'var(--accent)', color: 'var(--accent-text)' }}><Upload size={17} /> Import</Link><button type="button" onClick={ask} className="inline-flex items-center gap-2 rounded-lg px-4 font-semibold" style={{ minHeight: 44, border: '1px solid var(--border)' }}><MessageCircle size={17} /> Ask Octi</button></div></div>
}
