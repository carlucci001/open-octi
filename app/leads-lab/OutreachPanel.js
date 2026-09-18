'use client'
import { useState } from 'react'
import { MailX } from 'lucide-react'
import { useCachedData } from '@/lib/useCachedData'
import { OUTREACH_LIST, outreachLabel } from '@/lib/outreach-config'

export default function OutreachPanel() {
  const leads = useCachedData('/api/leads', { extract: data => data?.leads || [] })
  const [error, setError] = useState('')
  const list = (leads.data || []).filter(lead => lead.leadListId === OUTREACH_LIST)
  async function suppress(lead) {
    setError('')
    try {
      const response = await fetch('/api/outreach/suppress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: lead.id }) })
      if (!response.ok) throw new Error("Couldn't save Don't email")
      await leads.refresh()
    } catch (err) { setError(err.message) }
  }
  return <details className="rounded-lg p-4 mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
    <summary className="text-sm font-semibold cursor-pointer">New business owners · Outreach</summary>
    {error && <p role="alert">{error}</p>}
    <div className="overflow-x-auto max-h-80 mt-3"><table className="w-full text-xs text-left">
      <thead><tr><th className="p-2">Business</th><th className="p-2">Email</th><th className="p-2">Outreach</th><th className="p-2"><span className="sr-only">Actions</span></th></tr></thead>
      <tbody>{list.map(lead => <tr key={lead.id} style={{ borderTop: '1px solid var(--border)' }}>
        <td className="p-2"><a href={`/?tab=leads&leadId=${encodeURIComponent(lead.id)}`}>{lead.businessName || lead.name}</a></td>
        <td className="p-2">{lead.email || '—'}</td><td className="p-2" data-outreach-status={lead.id}>{outreachLabel(lead)}</td>
        <td className="p-2">{lead.email && <button type="button" title="Don't email" aria-label={`Don't email ${lead.businessName || lead.name}`} disabled={['suppressed', 'bounced'].includes(lead.outreach?.status)} onClick={() => suppress(lead)} className="p-2 rounded-full" style={{ border: '1px solid var(--border)' }}><MailX size={15} /></button>}</td>
      </tr>)}</tbody>
    </table>{!list.length && <p className="p-2">No new business owners yet.</p>}</div>
  </details>
}
