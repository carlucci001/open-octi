'use client'

import Link from 'next/link'
import { Check, ChevronDown, ChevronUp, Circle, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { isOpenOcti } from '@/lib/edition'

const MODEL_CAPABILITIES = new Set(['anthropic', 'openai', 'gemini', 'openrouter'])

export default function OpenOctiFirstRun() {
  const [profile, setProfile] = useState(null)
  const [modelConfigured, setModelConfigured] = useState(false)
  const [businessName, setBusinessName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [expanded, setExpanded] = useState(true)
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpenOcti()) return
    Promise.all([
      fetch('/api/openocti/setup', { cache: 'no-store' }).then(response => response.json()),
      fetch('/api/platform-admin/v1/capabilities', { cache: 'no-store' }).then(response => response.json()),
    ]).then(([setup, manifest]) => {
      if (!setup.ok) throw new Error(setup.error || 'Setup status unavailable')
      setProfile(setup.profile)
      setBusinessName(setup.profile.businessName || '')
      setOwnerName(setup.profile.ownerName || '')
      setPhone(setup.profile.phone || '')
      setWebsite(setup.profile.website || '')
      setModelConfigured((manifest.capabilities || []).some(item => MODEL_CAPABILITIES.has(item.id) && item.status === 'configured'))
      setExpanded(!setup.profile.complete)
    }).catch(reason => setError(reason.message))
  }, [])

  const steps = useMemo(() => [
    { id: 'workspace', label: 'Name your workspace', done: Boolean(profile?.complete) },
    { id: 'model', label: 'Add a model key', done: modelConfigured, href: '/settings/models' },
    { id: 'agents', label: 'Meet your agents', done: Boolean(profile?.firstRunVisitedAgentsAt), href: '/?tab=agents&ask=octi', action: 'visit-agents' },
    { id: 'import', label: 'Import your data', done: Boolean(profile?.firstRunImportOpenedAt), href: '/settings/import', action: 'open-import' },
  ], [profile, modelConfigured])
  const completed = steps.filter(step => step.done).length

  if (!isOpenOcti() || profile?.firstRunDismissed || completed === steps.length) return null

  const patchProgress = async action => {
    try {
      const response = await fetch('/api/openocti/setup', {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }),
      })
      const result = await response.json()
      if (response.ok && result.ok) setProfile(result.profile)
    } catch {}
  }

  const saveWorkspace = async event => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/openocti/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ businessName, ownerName, phone, website }),
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || 'Setup could not be saved')
      setProfile(result.profile)
      setExpanded(false)
    } catch (reason) {
      setError(reason.message)
    } finally {
      setSaving(false)
    }
  }

  if (completed > 0 && !expanded) {
    return (
      <div className="rounded-xl p-4 mb-6" style={{ background: '#001040', border: '1px solid #30c0f0', color: '#fff' }}>
        <button type="button" onClick={() => setExpanded(true)} className="w-full flex items-center gap-3 text-left" aria-expanded="false">
          <span className="font-semibold">Getting started</span>
          <span className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: '#172f5e' }}><span className="block h-full" style={{ width: `${completed * 25}%`, background: '#30c0f0' }} /></span>
          <span className="text-sm">{completed}/4</span><ChevronDown size={18} />
        </button>
      </div>
    )
  }

  return (
    <section className="rounded-xl p-5 mb-6" style={{ background: '#001040', border: '1px solid #30c0f0', color: '#fff' }}>
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-lg font-semibold">Welcome to OpenOcti</h2><p className="text-sm mt-1" style={{ color: '#8ba0c4' }}>Four quick steps, then your workspace is ready.</p></div>
        <div className="flex items-center gap-1">
          {completed > 0 && <button type="button" onClick={() => setExpanded(false)} title="Collapse checklist" className="p-2 rounded-lg"><ChevronUp size={18} /></button>}
          <button type="button" onClick={() => patchProgress('dismiss')} title="Dismiss checklist" className="p-2 rounded-lg"><X size={18} /></button>
        </div>
      </div>
      <ol className="mt-4 grid gap-2">
        {steps.map((step, index) => (
          <li key={step.id} className="rounded-lg p-3" style={{ background: step.done ? 'rgba(48,192,240,.12)' : '#071a42', border: '1px solid #294b78' }}>
            <div className="flex items-center gap-3">
              {step.done ? <Check size={20} color="#30c0f0" /> : <Circle size={20} color="#8ba0c4" />}
              <span className="flex-1 font-medium">{index + 1}. {step.label}</span>
              {step.href && !step.done && <Link href={step.href} onClick={() => step.action && patchProgress(step.action)} className="rounded-lg px-3 py-2 font-semibold" style={{ color: '#001040', background: '#30c0f0' }}>Open</Link>}
            </div>
            {step.id === 'workspace' && !step.done && (
              <form onSubmit={saveWorkspace} className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-sm">Business name<input required maxLength={120} value={businessName} onChange={event => setBusinessName(event.target.value)} className="mt-1 w-full rounded-lg px-3" style={{ minHeight: 48, background: '#000010', border: '1px solid #315080', color: '#fff' }} /></label>
                <label className="text-sm">Owner name<input required maxLength={120} value={ownerName} onChange={event => setOwnerName(event.target.value)} className="mt-1 w-full rounded-lg px-3" style={{ minHeight: 48, background: '#000010', border: '1px solid #315080', color: '#fff' }} /></label>
                <label className="text-sm">Phone <span style={{ color: '#8ba0c4' }}>(optional)</span><input maxLength={40} value={phone} onChange={event => setPhone(event.target.value)} className="mt-1 w-full rounded-lg px-3" style={{ minHeight: 48, background: '#000010', border: '1px solid #315080', color: '#fff' }} /></label>
                <label className="text-sm">Website <span style={{ color: '#8ba0c4' }}>(optional)</span><input maxLength={240} value={website} onChange={event => setWebsite(event.target.value)} className="mt-1 w-full rounded-lg px-3" style={{ minHeight: 48, background: '#000010', border: '1px solid #315080', color: '#fff' }} /></label>
                <button disabled={saving} className="rounded-lg px-4 font-semibold md:col-span-2" style={{ minHeight: 48, background: '#30c0f0', color: '#001040', opacity: saving ? 0.65 : 1 }}>{saving ? 'Saving…' : 'Save workspace name'}</button>
              </form>
            )}
          </li>
        ))}
      </ol>
      {error && <p role="alert" className="text-sm mt-3" style={{ color: '#fca5a5' }}>{error}</p>}
    </section>
  )
}
