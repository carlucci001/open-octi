'use client'

import { useEffect, useState } from 'react'
import { isOpenOcti } from '@/lib/edition'

export default function OpenOctiFirstRun() {
  const [profile, setProfile] = useState(null)
  const [businessName, setBusinessName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpenOcti()) return
    fetch('/api/openocti/setup', { cache: 'no-store' })
      .then(response => response.json())
      .then(result => {
        if (!result.ok) throw new Error(result.error || 'Setup status unavailable')
        setProfile(result.profile)
        setBusinessName(result.profile.businessName || '')
        setOwnerName(result.profile.ownerName || '')
      })
      .catch(reason => setError(reason.message))
  }, [])

  if (!isOpenOcti() || profile?.complete) return null

  const save = async event => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/openocti/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ businessName, ownerName }),
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || 'Setup could not be saved')
      setProfile(result.profile)
    } catch (reason) {
      setError(reason.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="rounded-xl p-5 mb-6" style={{ background: '#001040', border: '1px solid #30c0f0', color: '#fff' }}>
      <h2 className="text-lg font-semibold">Welcome to OpenOcti</h2>
      <p className="text-sm mt-1 mb-4" style={{ color: '#8ba0c4' }}>Name your workspace. This fills the starter agents' business and owner placeholders without overwriting an existing OpenClaw configuration.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-sm">Business name<input required maxLength={120} value={businessName} onChange={event => setBusinessName(event.target.value)} className="mt-1 w-full rounded-lg px-3" style={{ minHeight: 48, background: '#000010', border: '1px solid #315080', color: '#fff' }} /></label>
        <label className="text-sm">Owner name<input required maxLength={120} value={ownerName} onChange={event => setOwnerName(event.target.value)} className="mt-1 w-full rounded-lg px-3" style={{ minHeight: 48, background: '#000010', border: '1px solid #315080', color: '#fff' }} /></label>
      </div>
      {error && <p role="alert" className="text-sm mt-3" style={{ color: '#fca5a5' }}>{error}</p>}
      <button disabled={saving} className="rounded-lg px-4 mt-4 font-semibold" style={{ minHeight: 48, background: '#30c0f0', color: '#001040', opacity: saving ? 0.65 : 1 }}>{saving ? 'Saving…' : 'Finish setup'}</button>
    </form>
  )
}
