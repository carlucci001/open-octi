'use client'
import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import OpenOctiGuidePanel from './OpenOctiGuidePanel'
import { resolveOpenOctiAssistant } from '@/lib/openocti-assistant'

export default function OpenOctiAskButton() {
  const [enabled, setEnabled] = useState(false)
  const [opened, setOpened] = useState(false)
  const [prompt, setPrompt] = useState('')
  const dialog = useRef(null)
  const refresh = () => fetch('/api/platform-admin/v1/capabilities', { cache: 'no-store' }).then(response => response.json()).then(data => setEnabled(Boolean(resolveOpenOctiAssistant(data.capabilities || []).textProvider))).catch(() => {})
  useEffect(() => {
    refresh()
    const show = event => { setPrompt(String(event?.detail?.prompt || '')); setOpened(true) }
    const readLocation = () => { if (new URLSearchParams(window.location.search).get('ask') === 'octi') show() }
    readLocation()
    window.addEventListener('openocti:ask', show)
    window.addEventListener('popstate', readLocation)
    window.addEventListener('openocti:key-saved', refresh)
    return () => { window.removeEventListener('openocti:ask', show); window.removeEventListener('popstate', readLocation); window.removeEventListener('openocti:key-saved', refresh) }
  }, [])
  useEffect(() => { if (opened && dialog.current && !dialog.current.open) dialog.current.showModal() }, [opened])
  const close = () => { dialog.current?.close(); setOpened(false) }
  const open = () => { setPrompt(''); setOpened(true) }
  return <>
    <button type="button" onClick={open} title="Ask Octi" className="inline-flex items-center gap-2 rounded-lg px-3 font-semibold" style={{ minHeight: 34, color: enabled ? 'var(--text)' : 'var(--text-muted)', border: '1px solid var(--border)', background: 'var(--surface2)' }}><img src="/openocti/favicon.png" alt="" aria-hidden="true" width={28} height={28} className="shrink-0 object-contain" /> Ask Octi</button>
    {opened && <dialog ref={dialog} aria-label="Meet Octi, your OpenOcti guide" onCancel={close} onClose={() => setOpened(false)} className="rounded-xl p-0 backdrop:bg-black/60" style={{ position: 'fixed', inset: 0, margin: 'auto', width: 'min(640px, calc(100vw - 32px))', maxHeight: '85vh', overflow: 'auto', color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between px-5 pt-4"><div className="flex items-center gap-3"><img src="/openocti/favicon.png" alt="Octi" width={48} height={48} /><h1 className="font-semibold">Meet Octi, your OpenOcti guide</h1></div><button type="button" onClick={close} aria-label="Close Octi guide" title="Close guide" className="rounded-lg p-2"><X size={20} /></button></div>
      <OpenOctiGuidePanel key={prompt} initialPrompt={prompt} />
    </dialog>}
  </>
}
